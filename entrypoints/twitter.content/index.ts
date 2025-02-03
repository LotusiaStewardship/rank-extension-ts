import { MatchPattern } from 'wxt/sandbox'
import { Parser } from '@/utils/parser'
import { Selector } from '@/utils/selector'
import { walletMessaging } from '@/entrypoints/background/messaging'
import type { ScriptChunkSentimentUTF8 } from 'rank-lib'
import { CheerioAPI, load } from 'cheerio'
import { DEFAULT_RANK_THRESHOLD, DEFAULT_RANK_API } from '@/utils/constants'
import {
  ROOT_URL,
  VOTE_POSITIVE_ARROW_SVG,
  VOTE_NEGATIVE_ARROW_SVG,
} from './constants'
import './style.css'
/**
 *  Types
 */
/**  */
type ProfileSentiment = ScriptChunkSentimentUTF8 | 'neutral'
/**  */
type ProcessedPostElement = {
  isAd: boolean
  profileId: string
  retweetProfileId?: string
  quoteProfileId?: string
  postId: string
}
/** */
type CachedPost = {
  element: HTMLElement //
  upvoteButton: HTMLButtonElement
  downvoteButton: HTMLButtonElement
  profileId: string
  profileAvatar: HTMLElement
  ranking: bigint
  votesPositive: number
  votesNegative: number
}
/** */
type CachedProfile = {
  sentiment: ProfileSentiment
  ranking: bigint
  votesPositive: number
  votesNegative: number
}
/** */
type CachedPostMap = Map<string, CachedPost> // string is postId
/** */
type CachedProfileMap = Map<string, CachedProfile> // string is profileId
/** */
type RankAPIParams = {
  platform: string
  profileId: string
}
/** Profile ranking returned from RANK backend API */
type IndexedRanking = RankAPIParams & {
  ranking: string
  votesPositive: number
  votesNegative: number
}
/** Post ranking returned from RANK backend API */
type IndexedPostRanking = IndexedRanking & {
  profile: IndexedRanking
  postId: string
}
/** */
type RankAPIResult = IndexedRanking | IndexedPostRanking
/** */
type RankAPIErrorResult = {
  error: string
  params: Partial<IndexedRanking>
}
type StateKey = 'postIdBusy' | 'postUpdateTimeout' | 'postVoteUpdateInterval'
type AvatarElementType =
  | 'post'
  | 'profile'
  | 'profilePopover'
  | 'notification'
  | 'other'
/**
 *  Constants and Variables
 */
/** */
const defaultRanking: Partial<RankAPIResult> = {
  ranking: '0',
  votesPositive: 0,
  votesNegative: 0,
}
/** */
const postCache: CachedPostMap = new Map()
/** */
const profileCache: CachedProfileMap = new Map()
/** URL match patterns */
const urlPost = new RegExp(/.*\/status\/[0-9]+/)
const state: Map<StateKey, NodeJS.Timeout | string | null> = new Map()
/** Overlay button that is used to reveal blurred posts */
const overlayButton = document.createElement('button')
/** Overlay span to put text on the overlay button */
const overlaySpan = document.createElement('span')
/**
 *  Functions
 */
const createOverlay = (postId: string): HTMLButtonElement => {
  // Set up overlay button, text
  const overlay = overlayButton.cloneNode() as HTMLButtonElement // new HTMLDivElement()
  overlay.classList.add('blurred-overlay')
  // overlay.setAttribute('data-profileid', profileId)
  overlay.setAttribute('data-postid', postId)
  overlay.addEventListener('click', handleBlurredOverlayClick)
  const overlayText = overlaySpan.cloneNode() as HTMLSpanElement //new HTMLSpanElement()
  overlayText.classList.add('blurred-overlay-text')
  overlayText.innerHTML = 'Post has poor reputation, click to view'
  overlay.appendChild(overlayText)

  return overlay
}
/**
 * Checks various conditions to see whether or not a post can be blurred
 * @param postId
 * @param cachedPost
 */
const canBlurPost = (postId: string, cachedPost: CachedPost): boolean => {
  // if we're on the post's URL, don't blur
  if (window.location.pathname.includes(postId)) {
    return false
  }
  // if post ranking is above default threshold, don't blur
  if (cachedPost.ranking >= DEFAULT_RANK_THRESHOLD) {
    return false
  }
  // we can blur the post
  return true
}
/**
 * Iterate through cached posts and update their ranking, vote buttons, etc.
 */
const updateCachedPosts = async () => {
  for (const [postId] of postCache) {
    // skip updating posts that are processing vote button clicks
    if (postId == state.get('postIdBusy')) {
      continue
    }
    // interrupt if post cache update interval is disabled
    if (!state.get('postVoteUpdateInterval')) {
      return
    }
    try {
      // update the cached post
      const cachedPost = await updateCachedPost(postId)
      // check if post can be blurred, and then do so if necessary
      if (canBlurPost(postId, cachedPost)) {
        const { element, profileId } = cachedPost
        blurPost(element, profileId, postId, 'post reputation below threshold')
      }
    } catch (e) {
      continue
    }
  }
}
/**
 * Parse post element to gather details for fetching and caching
 * @param $ `HTMLElement` loaded into `CheerioAPI`
 * @returns {ProcessedPostElement}
 */
const parsePostElement = ($: CheerioAPI): ProcessedPostElement => {
  // Select elements
  const adDiv = $(Selector.Twitter.Article.div.ad)
  const tweetTextDiv = $(Selector.Twitter.Article.div.tweetText)
  const tweetUserNameLink = $(Selector.Twitter.Article.a.tweetUserName)
  const retweetUserNameLink = $(Selector.Twitter.Article.a.retweetUserName)
  const postIdLink = $(Selector.Twitter.Article.a.tweetId).last()
  const quoteTweet = $(Selector.Twitter.Article.div.quoteTweet)
  const quoteUserNameDiv = $(Selector.Twitter.Article.div.quoteTweetUserName)
  // Parse elements for text data
  const postText = Parser.Twitter.Article.postTextFromElement(tweetTextDiv)
  const profileId = Parser.Twitter.Article.profileIdFromElement(tweetUserNameLink)
  const quoteProfileId =
    Parser.Twitter.Article.quoteProfileIdFromElement(quoteUserNameDiv)
  const retweetProfileId =
    Parser.Twitter.Article.profileIdFromElement(retweetUserNameLink)
  const postId = Parser.Twitter.Article.postIdFromElement(postIdLink)

  const processedElement = {} as ProcessedPostElement
  processedElement.isAd = adDiv.length == 1 ? true : false
  processedElement.profileId = profileId as string
  processedElement.postId = postId
  if (retweetProfileId) {
    processedElement.retweetProfileId = retweetProfileId
  }
  if (quoteProfileId) {
    processedElement.quoteProfileId = quoteProfileId
  }

  return processedElement
}
/**
 * Set up the post element with vote buttons, blurring, etc.
 * @param element
 * @param profileId
 * @param postId
 */
const processPostElement = async (
  element: HTMLElement,
  profileId: string,
  postId: string,
) => {
  // Mutate post element to add RANK vote buttons, etc.
  const [upvoteButton, downvoteButton] = mutatePostElement(element, {
    profileId,
    postId,
  } as ProcessedPostElement)
  // Get the profile avatar element from the post
  const profileAvatar = element.querySelector(
    Selector.Twitter.Article.div.profileAvatar,
  ) as HTMLElement
  // add this post and profile to the appropriate caches
  postCache.set(postId, {
    element,
    upvoteButton,
    downvoteButton,
    profileId,
    profileAvatar,
    ranking: 0n,
    votesPositive: 0,
    votesNegative: 0,
  })
  profileCache.set(profileId, {
    sentiment: 'neutral',
    ranking: 0n,
    votesPositive: 0,
    votesNegative: 0,
  })
  // Immediately update the post ranking and vote count with API data
  const cachedPost = await updateCachedPost(postId)
  if (canBlurPost(postId, cachedPost)) {
    blurPost(element, profileId, postId, 'post reputation below threshold')
  }
}
/**
 *
 * @param element
 * @param postId
 */
const mutatePostElement = (
  element: HTMLElement,
  data: ProcessedPostElement,
): [HTMLButtonElement, HTMLButtonElement] => {
  // Get existing like/unlike button, container, and button row
  const origButton =
    element.querySelector(Selector.Twitter.Article.button.tweetLikeButton)! ??
    element.querySelector(Selector.Twitter.Article.button.tweetUnlikeButton)!
  const origButtonContainer = origButton.parentElement!
  const buttonRow = origButtonContainer.parentNode!
  // Create upvote button and its container
  const upvoteButtonContainer = origButton.parentElement!.cloneNode() as Element
  const upvoteButton = origButton.cloneNode(true) as HTMLButtonElement
  updatePostVoteButtonVoteCount(upvoteButton, 0)
  upvoteButton.setAttribute('data-testid', 'upvote')
  upvoteButton.setAttribute('data-postid', data.postId)
  upvoteButton.setAttribute('data-profileid', data.profileId)
  upvoteButton.setAttribute('data-sentiment', 'positive')
  upvoteButton.setAttribute('aria-label', '0 upvotes. Upvote')
  upvoteButton.addEventListener('click', handlePostVoteButtonClick)
  const upvoteSvg = upvoteButton.querySelector('svg')!
  upvoteSvg.outerHTML = VOTE_POSITIVE_ARROW_SVG
  upvoteButtonContainer.appendChild(upvoteButton)
  // Create downvote button and its container
  const downvoteButtonContainer = origButton.parentElement!.cloneNode() as Element
  const downvoteButton = origButton.cloneNode(true) as HTMLButtonElement
  updatePostVoteButtonVoteCount(upvoteButton, 0)
  downvoteButton.setAttribute('data-testid', 'downvote')
  downvoteButton.setAttribute('data-postid', data.postId)
  downvoteButton.setAttribute('data-profileid', data.profileId)
  downvoteButton.setAttribute('data-sentiment', 'negative')
  downvoteButton.setAttribute('aria-label', '0 downvotes. Downvote')
  downvoteButton.addEventListener('click', handlePostVoteButtonClick)
  const downvoteSvg = downvoteButton.querySelector('svg')!
  downvoteSvg.outerHTML = VOTE_NEGATIVE_ARROW_SVG
  downvoteButtonContainer.appendChild(downvoteButton)
  // Adjust the button row accordingly
  origButtonContainer.classList.add('hidden')
  buttonRow.insertBefore(upvoteButtonContainer, origButtonContainer)
  buttonRow.insertBefore(downvoteButtonContainer, origButtonContainer)
  return [upvoteButton, downvoteButton]
}
/**
 * Given the `HTMLElement`, fetch the upvote and downvote buttons for necessary procesing
 * @param element
 * @param postId
 * @returns
 */
const getPostVoteButtons = (
  element: HTMLElement,
): [HTMLButtonElement, HTMLButtonElement] => [
  element.querySelector(
    Selector.Twitter.Article.button.postUpvoteButton,
  ) as HTMLButtonElement,
  element.querySelector(
    Selector.Twitter.Article.button.postDownvoteButton,
  ) as HTMLButtonElement,
]
/**
 *
 * @param button
 * @returns
 */
const getPostVoteButtonCountElement = (
  button: HTMLButtonElement,
): HTMLSpanElement => {
  const voteButtonSpans = button.querySelectorAll('span')! as NodeList
  return voteButtonSpans.item(voteButtonSpans.length - 1) as HTMLSpanElement
}
/**
 *
 * @param button Vote button to update total vote count
 * @param count Total votes, or number of votes to increment to current value
 * @param increment If true, will add `count` to the existing value. Otherwise, will reset the value to `count`
 */
const updatePostVoteButtonVoteCount = (
  button: HTMLButtonElement,
  count: number,
  increment?: boolean,
) => {
  const span = getPostVoteButtonCountElement(button)
  span.innerHTML = String(increment ? Number(span.innerHTML) + count : count)
}
/**
 *
 * @param sentiment
 * @param postId
 * @returns {CachedPost} The updated, cached post
 */
const updateCachedPost = async (postId: string): Promise<CachedPost> => {
  const cachedPost = postCache.get(postId)!
  const { upvoteButton, downvoteButton, profileId, profileAvatar } = cachedPost
  const cachedProfile = profileCache.get(profileId)!
  const result = (await fetchRankApiData(profileId, postId)) as IndexedPostRanking
  // check if cached data differs from API data, then update
  // update cached post stats
  const postRanking = BigInt(result.ranking)
  cachedPost.ranking = postRanking
  cachedPost.votesPositive = result.votesPositive
  cachedPost.votesNegative = result.votesNegative
  // update cached profile stats
  const profileRanking = BigInt(result.profile.ranking)
  cachedProfile.ranking = profileRanking
  cachedProfile.votesPositive = result.profile.votesPositive
  cachedProfile.votesNegative = result.profile.votesNegative
  // Update the vote counts on post vote buttons
  updatePostVoteButtonVoteCount(upvoteButton, result.votesPositive)
  updatePostVoteButtonVoteCount(downvoteButton, result.votesNegative)
  // check if profile sentiment
  let sentiment: ProfileSentiment
  if (profileRanking > 0n) {
    sentiment = 'positive'
  } else if (profileRanking < 0n) {
    sentiment = 'negative'
  } else {
    sentiment = 'neutral'
  }
  cachedProfile.sentiment = sentiment
  // Set profile avatar
  setProfileAvatarBadge(profileAvatar, sentiment)
  // return the cached post for additional processing
  return cachedPost
}
/**
 *
 * @param profileId
 * @param postId
 * @param reason
 */
const hidePost = (profileId: string, postId: string, reason: string) => {
  console.log(`hiding post with ID ${postId} from profile ${profileId} (${reason})`)
  postCache.get(postId)?.element.classList.add('hidden')
}
/**
 *
 * @param profileId
 * @param postId
 * @param reason
 */
const blurPost = (
  element: HTMLElement,
  profileId: string,
  postId: string,
  reason: string,
) => {
  // if element already blurred, don't continue
  if (element.querySelector('.blurred')) {
    return
  }
  const article = element.querySelector('article')!
  // article element resets CSS classes on hover, thanks to Twitter javascript
  // so we blur the parent element instead, which achieves the same effect
  const postParentElement = article.parentElement!
  const overlay = createOverlay(postId)
  // Apply blur and overlay to post
  console.log(`blurring post ${profileId}/${postId} (${reason})`)
  postParentElement.classList.add('blurred')
  postParentElement.parentElement!.style.overflow = 'hidden !important'
  postParentElement.parentElement!.append(overlay)
}
/**
 *
 * @param avatar
 * @param sentiment
 * @returns
 */
const setProfileAvatarBadge = (avatar: HTMLElement, sentiment: ProfileSentiment) => {
  const element = avatar.parentElement as HTMLElement
  const elementWidth = avatar.style.width ?? `${String(avatar.offsetWidth)}px`
  console.log('elementWidth', elementWidth, avatar.offsetWidth)
  // Clear the old reputation badge class
  const className = avatar.classList
    .entries()
    .find(([, className]) => className.includes('reputation'))
  switch (elementWidth) {
    // e.g. like notifications
    case '32px': {
      break
    }
    // e.g. timeline posts
    case '40px': {
      return className
        ? avatar.classList.replace(
            className[1],
            `post-avatar-${sentiment}-reputation`,
          )
        : avatar.classList.add(`post-avatar-${sentiment}-reputation`)
    }
    // e.g. post avatar popover (i.e. mouseover avatar)
    case '64px': {
      break
    }
    /*
    // Assume profile avatar if no specific width style available
    default: {
      return className
        ? avatar.classList.replace(
            className[1],
            `profile-avatar-${sentiment}-reputation`,
          )
        : avatar.classList.add(`profile-avatar-${sentiment}-reputation`)
    }
    */
  }
}
/**
 *
 * @param profileId
 * @param postId
 * @returns
 */
const fetchRankApiData = async (
  profileId: string,
  postId?: string,
): Promise<RankAPIResult> => {
  const apiPath = postId
    ? `${DEFAULT_RANK_API}/twitter/${profileId}/${postId}`
    : `${DEFAULT_RANK_API}/twitter/${profileId}`
  try {
    const result = await fetch(apiPath)
    return (await result.json()) as RankAPIResult
  } catch (e) {
    console.error(`fetchRankApiData`, e)
    // No ranking data found, so profile/post is a neutral rank
    return defaultRanking as RankAPIResult
  }
}
/**
 *  Timers
 */
/** Timeout to react to document scroll and clear/set post update interval */
state.set('postUpdateTimeout', null)
/** Interval to update cached post/profile rankings */
state.set('postVoteUpdateInterval', setInterval(updateCachedPosts, 5000))
/**
 *  Event Handlers
 */
/**
 *
 * @param this
 * @param ev
 */
async function handleBlurredOverlayClick(this: HTMLButtonElement) {
  const postId = this.getAttribute('data-postid')!
  postCache.get(postId)!.element.querySelector('article')!.click()
}
/**
 *
 * @param this
 * @param ev
 */
async function handlePostVoteButtonClick(this: HTMLButtonElement) {
  // disable the button first
  this.disabled = true
  // gather required data for submitting vote to Lotus network
  const postId = this.getAttribute('data-postid')!
  const profileId = this.getAttribute('data-profileid')!
  const sentiment = this.getAttribute('data-sentiment')! as ScriptChunkSentimentUTF8
  // skip auto-updating this post since it will be updated below
  state.set('postIdBusy', postId)
  console.log(`casting ${sentiment} vote for ${profileId}/${postId}`)
  try {
    const txid = await walletMessaging.sendMessage('content-script:submitRankVote', {
      platform: 'twitter',
      profileId,
      sentiment,
      postId,
    })
    console.log(
      `successfully cast ${sentiment} vote for ${profileId}/${postId}`,
      txid,
    )
    // TODO: update profile ranking with actual vote amount, not just default
    // updateCachedProfile(profileId, sentiment)
    // update cached post if vote was cast for a post
    if (postId) {
      const cachedPost = await updateCachedPost(postId)
      if (canBlurPost(postId, cachedPost)) {
        const { element } = cachedPost
        blurPost(element, profileId, postId, 'post reputation below threshold')
      }
    }
  } catch (e) {
    console.log(`failed to cast ${sentiment} vote for ${profileId}/${postId}`, e)
  } finally {
    // enable button and allow this post to be auto-updated
    this.disabled = false
    state.delete('postIdBusy')
  }
}
/**
 *  Event Registrations
 */
/** */
document.addEventListener('scroll', function (this: Document, ev: Event) {
  // if this timeout is already set on scroll, reset it
  if (state.get('postUpdateTimeout')) {
    clearTimeout(state.get('postUpdateTimeout') as NodeJS.Timeout)
    clearInterval(state.get('postVoteUpdateInterval') as NodeJS.Timeout)
    state.delete('postUpdateTimeout')
    state.delete('postVoteUpdateInterval')
  }
  state.set(
    'postUpdateTimeout',
    setTimeout(() => {
      const root = this.body.querySelector('div#react-root') as HTMLElement
      const removed: string[] = []
      // filter out posts that are no longer in the DOM
      for (const [postId, { profileId }] of postCache) {
        //console.log(`validating that post ${profileId}/${postId} exists in DOM`)
        if (!root.querySelector(`a[href*="/status/${postId}"]`)) {
          console.log(
            `removing post ${profileId}/${postId} from cache (missing from DOM)`,
          )
          removed.push(postId)
        }
      }
      removed.forEach(postId => postCache.delete(postId))
      // Re-enable postCache update interval
      state.set(
        'postVoteUpdateInterval',
        setInterval(
          updateCachedPosts,
          postCache.size < 10 || postCache.size > 20 ? 5000 : postCache.size * 500,
        ),
      )
    }, 500),
  )
})
/*
const preventUnload = function (this: Window, ev: BeforeUnloadEvent) {
  console.log(ev)
}
window.addEventListener('beforeunload', preventUnload)
*/
/** Observe the configured root node of the document and enforce profile/post rankings in the DOM */
class Mutator {
  /** https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver */
  private observers: Map<'react-root', MutationObserver>
  /** https://wxt.dev/guide/essentials/content-scripts.html#dealing-with-spas */
  private urlPatterns: Map<
    'home' | 'notifications' | 'timeline' | 'post' | 'bookmarks',
    MatchPattern
  >
  /** The root node of the DOM that is observed for mutations */
  private root: Element
  /** Initial runtime setup */
  constructor() {
    // set up react-root observer
    this.observers = new Map()
    this.observers.set('react-root', new MutationObserver(this.handleRootMutations))
    // set URL patterns
    this.urlPatterns = new Map()
    this.urlPatterns.set('home', new MatchPattern(`${ROOT_URL}/home`))
    this.urlPatterns.set(
      'notifications',
      new MatchPattern(`${ROOT_URL}/notifications`),
    )
    this.urlPatterns.set('timeline', new MatchPattern(`${ROOT_URL}/*`))
    this.urlPatterns.set('post', new MatchPattern(`${ROOT_URL}/*/status/*`))
    this.urlPatterns.set('bookmarks', new MatchPattern(`${ROOT_URL}/*/bookmarks`))
    // set the root node for observation
    const root = document.body.querySelector(Selector.Twitter.Container.div.root)
    if (!root) {
      throw new Error(
        `could not find ${Selector.Twitter.Container.div.root} in document body`,
      )
    }
    this.root = root
  }
  /** Begin observing the root node of the DOM for mutations */
  public startMutationObserver = () => {
    // Begin observing root node to find the timeline node
    console.log('connecting react-root observer')
    this.observers.get('react-root')?.observe(this.root as Node, {
      childList: true,
      subtree: true,
      characterData: false,
      // TODO: use attribute mutation events for additional processing?
      attributeFilter: ['data-ranking'],
    })
  }
  /**
   *
   * @param element
   * @returns
   */
  private isValidElement = (element: HTMLElement) => {
    const $ = load(element.outerHTML)
    let elementType: 'post' | 'notification' | 'avatar' | 'button' | 'ad' | null =
      null
    // element is from tweet timeline (home, bookmarks, etc.)
    if (
      $(Selector.Twitter.Article.div.tweet).length == 1 &&
      // bugfix: prevent duplicate processing on `/status/:postId` URIs
      $(Selector.Twitter.Article.div.tweet).parents().length == 2
    ) {
      elementType = 'post'
    }
    // element is from notification timeline
    else if ($(Selector.Twitter.Article.div.notification).length == 1) {
      elementType = 'notification'
    }
    // element is the dumb Grok actions button
    else if ($(Selector.Twitter.Article.button.grokActions).length == 1) {
      elementType = 'button'
    }
    // element is a profile avatar
    else if ($(Selector.Twitter.Article.div.profileAvatar).length == 1) {
      elementType = 'avatar'
    }

    return { $, elementType }
  }
  /**
   *
   * @param nodes
   */
  private handleRemovedNodes = async (nodes: NodeList) => {
    for (const node of nodes) {
      const element = node as HTMLElement
      // make sure the element is parseable
      if (!element.outerHTML) {
        continue
      }
      const { $, elementType } = this.isValidElement(element)
      if (!elementType) {
        continue
      }
      const t0 = performance.now()
      switch (elementType) {
        case 'post': {
          try {
            const { profileId, retweetProfileId, postId } = parsePostElement($)
            // Get the postId and delete the post from the cache
            postCache.delete(postId)
            const t1 = (performance.now() - t0).toFixed(3)
            console.log(
              `processed removing post ${profileId}/${postId} from cache in ${t1}ms`,
            )
          } catch (e) {
            // ignore processing errors for now; just continue to next element
            continue
          }
          break
        }
        case 'notification':
          // may not even need to do anything with this
          break
      }
    }
  }
  /**
   *
   * @param nodes
   */
  private handleAddedNodes = async (nodes: NodeList) => {
    for (const node of nodes) {
      const element = node as HTMLElement
      // make sure the element is parseable
      if (!element.outerHTML) {
        continue
      }
      const { $, elementType } = this.isValidElement(element)
      if (!elementType) {
        continue
      }
      // Process the element depending on the determined type
      switch (elementType) {
        case 'post': {
          /**
           *
           *  BEGIN TEMP
           *
           */
          /*
          try {
            const quoteTweet = element.querySelector(
              Selector.Twitter.Article.div.quoteTweet,
            ) as HTMLElement
            if (quoteTweet) {
              const quoteTweetAvatar = quoteTweet.querySelector(
                Selector.Twitter.Article.div.quoteTweetProfileAvatar,
              )
              const quoteTweetProfileId = quoteTweet.querySelector(
                Selector.Twitter.Article.div.quoteTweetUserName,
              )
              console.log(quoteTweetAvatar)
              console.log(quoteTweetProfileId)
              console.log(quoteProfileId)
              quoteTweet.addEventListener('click', function (ev: MouseEvent) {
                //console.log(ev)
                //ev.preventDefault()
                console.log('clicked on the quoteTweet')
              })
            }
          } catch (e) {
            console.error(e)
          }
          */
          /**
           *
           *  END TEMP
           *
           */
          try {
            const t0 = performance.now()
            const { isAd, profileId, retweetProfileId, postId } = parsePostElement($)
            // Always hide ads :)
            if (isAd) {
              console.log(`hiding post ${profileId}/${postId} (Ad)`)
              element.classList.add('hidden')
              continue
            }
            await processPostElement(element, profileId, postId)
            const t1 = (performance.now() - t0).toFixed(3)
            console.log(
              `processed adding post ${profileId}/${postId} to cache in ${t1}ms`,
            )
          } catch (e) {
            // ignore processing errors for now; just continue to next element
            console.warn('element processing failed', e)
            continue
          }
          break
        }
        case 'notification':
          // process these elements specifically for profileId ranking
          break
        case 'button':
          // hide the Grok actions button (top-right corner of post)
          // currently the only button type supported
          element
            .querySelector(Selector.Twitter.Article.button.grokActions)
            ?.classList.add('hidden')
          break
        case 'avatar': {
          // TODO: set each avatar badge according to cached profile ranking
          // profile rankings will need to be maintained separately from posts
          // currently cached profiles are only updated when posts are updated
          // will need to work this out in the near future
          /*
          console.log(element)
          console.log(elementType)
          // get profileId from avatar element
          const avatar = $(Selector.Twitter.Article.div.profileAvatar)
          const profileId = Parser.Twitter.Article.profileIdFromAvatar(avatar)
          const cachedProfile = profileCache.get(profileId)
          // Set profile avatar badge if we have the profile cached already
          console.log(cachedProfile)
          const avatarElement = element.querySelector(
            Selector.Twitter.Article.div.profileAvatar,
          ) as HTMLElement
          setProfileAvatarBadge(avatarElement, cachedProfile?.sentiment ?? 'neutral')
          */
          break
        }
      }
    }
  }
  /**
   * Handle all mutations to the root node
   * @param mutations
   */
  private handleRootMutations = (mutations: MutationRecord[]) => {
    mutations.forEach(async mutation => {
      this.handleRemovedNodes(mutation.removedNodes)
      this.handleAddedNodes(mutation.addedNodes)
    })
  }
  /** Parse the provided `CheerioAPI` as a post check if ranking is below threshold */
  private isBelowThreshold = async (
    profileId: string,
    retweetProfileId?: string,
    postId?: string,
  ) => {
    // check if post element is reposted and check the reposter's ranking
    if (retweetProfileId) {
      // nada
    }
    /**
     * TODO: implement some form of the following for caching:
     * 1. save Profile/Post metadata to local storage
     * 2. background fetches updates on timer or event loop
     * 3. updates are fetched in batches; small enough for latency and large enough for reducing total number of requests
     * 4. relevant updates are made to the local cache
     * 5. content script only applies DOM updates based on cache
     */
    // fetch profile data from RANK API
    // If no data, continue to next tweet
    try {
      const profile = await fetch(`${DEFAULT_RANK_API}/twitter/${profileId}`)
      const parsed = (await profile.json()) as IndexedRanking
      const ranking = BigInt(parsed.ranking)
      // hide the post if the profile is below rank threshold
      // TODO: use user's threshold settings
      if (ranking < DEFAULT_RANK_THRESHOLD) {
        return true
      }
    } catch (e) {
      // if no username, return here
      // no postId will be indexed if the profileId is also not indexed
      return
    }
    // fetch tweet data from RANK API
    // If no data, continue to next tweet
    if (postId) {
      try {
        const post = await fetch(
          `${DEFAULT_RANK_API}/twitter/${profileId}/${postId}`,
        )
        const parsed = (await post.json()) as IndexedPostRanking
        const ranking = BigInt(parsed.ranking)
        // TODO: use user's threshold settings
        if (ranking < DEFAULT_RANK_THRESHOLD) {
          return true
        }
      } catch (e) {
        // ignore; postId is not indexed (i.e. neutral ranking)
        return
      }
    }
  }
}
/** Browser runs this when the configured `runAt` stage is reached */
export default defineContentScript({
  matches: ['https://*.x.com/*', 'https://x.com/*'],
  world: 'ISOLATED',
  // https://developer.chrome.com/docs/extensions/reference/api/extensionTypes#type-RunAt
  runAt: 'document_end',
  async main(ctx) {
    ctx.onInvalidated(() =>
      clearInterval(state.get('postVoteUpdateInterval') as NodeJS.Timeout),
    )
    ctx.addEventListener(window, 'wxt:locationchange', () => {
      // trigger onInvalidated handler if context is invalid
      if (ctx.isInvalid) {
        ctx.notifyInvalidated()
      }
    })

    // Start observing Twitter's `react-node` for mutations
    new Mutator().startMutationObserver()
  },
})
