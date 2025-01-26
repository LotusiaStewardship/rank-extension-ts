import { MatchPattern } from 'wxt/sandbox'
import { Parser } from '@/utils/parser'
import { Selector } from '@/utils/selector'
import { walletMessaging } from '@/entrypoints/background/messaging'
import { ScriptChunkSentimentUTF8 } from 'rank-lib'
import { CheerioAPI, load } from 'cheerio'
import {
  DEFAULT_RANK_THRESHOLD,
  DEFAULT_RANK_API,
  RANK_OUTPUT_MIN_VALUE,
} from '@/utils/constants'
import { ROOT_URL, VOTE_POSITIVE_ARROW_SVG, VOTE_NEGATIVE_ARROW_SVG } from './constants'
import './style.css'
/**
 *
 *  Types
 *
 */
/**  */
type ProcessedPostElement = {
  isAd: boolean
  profileId: string
  retweetProfileId?: string
  postId: string
}
/** */
type CachedPostElement = {
  element: HTMLElement //
  ranking: bigint
  votesPositive: number
  votesNegative: number
}
/**  */
type CachedProfile = {
  avatar: HTMLImageElement
  ranking: bigint
  votesPositive: number
  votesNegative: number
}
/** */
type CachedPostMap = Map<string, CachedPostElement> // string is postId
/** */
type CachedProfileMap = Map<string, CachedProfile> // string is profileId
/**  */
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
/**
 *
 *  Constants and Variables
 *
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
const urlPost = new RegExp(`\/.*\/status\/[0-9]+`)
let postIdBusy: string | null = null
/**
 *
 *  Functions
 *
 */
const checkPostRankingAndBlur = (
  profileId: string,
  postId: string,
  postRanking: bigint,
) => {
  // if we're on the post's URL, don't blur
  if (window.location.pathname.includes(postId)) {
    return
  }
  if (postRanking < DEFAULT_RANK_THRESHOLD) {
    blurPost(profileId, postId, 'post reputation below threshold')
  }
}
const updateCachedPosts = async () => {
  for (const [postId, cachedPost] of postCache) {
    // skip updating posts that are processing vote button clicks
    if (postId == postIdBusy) {
      continue
    }
    try {
      const element = cachedPost.element
      const [upvoteButton, downvoteButton] = getPostVoteButtons(element)
      const profileId = upvoteButton.getAttribute('data-profileid')!
      const result = await fetchRankApiData(profileId, postId)
      updatePostVoteButtonVoteCount(upvoteButton, result.votesPositive)
      updatePostVoteButtonVoteCount(downvoteButton, result.votesNegative)
      const postRanking = BigInt(result.ranking)
      checkPostRankingAndBlur(profileId, postId, postRanking)
    } catch (e) {
      continue
    }
  }
}
/**
 * Process post element and return data to fetch ranking from RANK API
 * @param $ `HTMLElement` loaded into `CheerioAPI`
 * @returns {ProcessedPostElement}
 */
const processPostElement = ($: CheerioAPI): ProcessedPostElement => {
  // Select elements
  const adDiv = $(Selector.Twitter.Article.div.ad)
  const tweetTextDiv = $(Selector.Twitter.Article.div.tweetText)
  const tweetUserNameLink = $(Selector.Twitter.Article.a.tweetUserName)
  const retweetUserNameLink = $(Selector.Twitter.Article.a.retweetUserName)
  const postIdLink = $(Selector.Twitter.Article.a.tweetId).last()
  // Parse elements for text data
  const postText = Parser.Twitter.Article.postTextFromElement(tweetTextDiv)
  const profileId = Parser.Twitter.Article.profileIdFromElement(tweetUserNameLink)
  const retweetProfileId =
    Parser.Twitter.Article.profileIdFromElement(retweetUserNameLink)
  const postId = Parser.Twitter.Article.postIdFromElement(postIdLink)

  const processedElement = {} as ProcessedPostElement
  processedElement.isAd = adDiv.length == 1 ? true : false
  processedElement.profileId = profileId
  processedElement.postId = postId
  if (retweetProfileId) {
    processedElement.retweetProfileId = retweetProfileId
  }

  return processedElement
}
/**
 *
 * @param element
 * @param postId
 */
const addPostVoteButtons = (
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
 *
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
const getPostVoteButtonCountElement = (button: HTMLButtonElement): HTMLSpanElement => {
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
const updateCachedPost = (sentiment: ScriptChunkSentimentUTF8, postId: string) => {
  const cachedPost = postCache.get(postId)!
  // add/subtract default output value based on sentiment
  // TODO: use custom rank output value
  cachedPost.ranking += BigInt(
    sentiment == 'positive' ? RANK_OUTPUT_MIN_VALUE : -RANK_OUTPUT_MIN_VALUE,
  )
  sentiment == 'positive' ? cachedPost.votesPositive++ : cachedPost.votesNegative++

  return cachedPost.ranking
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
const blurPost = (profileId: string, postId: string, reason: string) => {
  // article element resets CSS classes on hover, thanks to Twitter javascript
  // so we blur the parent element instead, which achieves the same effect
  const element = postCache.get(postId)!.element
  // if element already blurred, don't continue
  if (element.querySelector('.blurred')) {
    return
  }
  console.log(`blurring post with ID ${postId} from profile ${profileId} (${reason})`)
  const article = element.querySelector('article')!
  const postParentElement = article.parentElement!
  // Set up overlay button, text
  const overlay = document.createElement('button') // new HTMLDivElement()
  overlay.classList.add('blurred-overlay')
  overlay.setAttribute('data-profileid', profileId)
  overlay.setAttribute('data-postid', postId)
  overlay.addEventListener('click', handleBlurredOverlayClick)
  const overlayText = document.createElement('span') //new HTMLSpanElement()
  overlayText.classList.add('blurred-overlay-text')
  overlayText.innerHTML = 'Post has poor reputation, click to view'
  overlay.appendChild(overlayText)
  // Apply blur and overlay to post
  postParentElement.classList.add('blurred')
  postParentElement.parentElement!.style.overflow = 'hidden !important'
  postParentElement.parentElement!.append(overlay)
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
    const json = (await result.json()) as RankAPIResult
    if ((json as any as RankAPIErrorResult).error) {
      return defaultRanking as RankAPIResult
    }
    return json
  } catch (e) {
    console.log(`error fetching ranking data`, e)
    // No ranking data found, so profile/post is a neutral rank
    return defaultRanking as RankAPIResult
  }
}
/**
 *
 *  Timers
 *
 */
/** Timeout to react to document scroll and clear/set post update interval */
let postUpdateTimeout: NodeJS.Timeout | null = null
/** Interval to update cached post/profile rankings */
let postVoteUpdateInterval: NodeJS.Timeout = setInterval(updateCachedPosts, 2500)
/**
 *
 *  Event Handlers
 *
 */
/**
 *
 * @param this
 * @param ev
 */
async function handleBlurredOverlayClick(this: HTMLButtonElement, ev: MouseEvent) {
  const postId = this.getAttribute('data-postid')!
  postCache.get(postId)!.element.querySelector('article')!.click()
}
/**
 *
 * @param this
 * @param ev
 */
async function handlePostVoteButtonClick(this: HTMLButtonElement, ev: MouseEvent) {
  const postId = this.getAttribute('data-postid')!
  postIdBusy = postId
  const profileId = this.getAttribute('data-profileid')!
  const sentiment = this.getAttribute('data-sentiment')! as ScriptChunkSentimentUTF8
  console.log(`casting ${sentiment} vote for ${profileId}/${postId}`)
  const txid = await walletMessaging.sendMessage('content-script:submitRankVote', {
    platform: 'twitter',
    profileId,
    sentiment,
    postId,
  })
  if (txid) {
    console.log(`successfully cast ${sentiment} vote for ${profileId}/${postId}`, txid)
    updatePostVoteButtonVoteCount(this, 1, true)
    // TODO: update profile ranking with actual vote amount, not just default
    // updateCachedProfile(sentiment, profileId)
    // TODO: update post ranking with actual vote amount, not just default
    const postRanking = updateCachedPost(sentiment, postId)
    checkPostRankingAndBlur(profileId, postId, postRanking)
    postIdBusy = null
  }
}
/**
 *
 *  Event Registrations
 *
 */
document?.addEventListener('scroll', function (this: Document, ev: Event) {
  if (postUpdateTimeout) {
    clearTimeout(postUpdateTimeout)
    clearInterval(postVoteUpdateInterval)
  }
  postUpdateTimeout = setTimeout(() => {
    postVoteUpdateInterval = setInterval(updateCachedPosts, postCache.size * 200)
  }, 500)
})
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
    this.urlPatterns.set('notifications', new MatchPattern(`${ROOT_URL}/notifications`))
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
      attributeFilter: ['data-ranking'],
    })
  }
  private validateMutatedElement = (element: HTMLElement) => {
    const $ = load(element.outerHTML)
    let elementType: 'post' | 'notification' | 'button' | 'ad' | null = null
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
    } else if ($(Selector.Twitter.Article.button.grokActions).length == 1) {
      elementType = 'button'
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
      const { $, elementType } = this.validateMutatedElement(element)
      if (!elementType) {
        continue
      }
      const t0 = performance.now()
      const { profileId, retweetProfileId, postId } = processPostElement($)
      switch (elementType) {
        case 'post':
          // Get the postId and delete the post from the cache
          //const { postId } = processPostElement($)
          postCache.delete(postId)
          const t1 = (performance.now() - t0).toFixed(3)
          console.log(
            `processed removing post ${profileId}/${postId} from cache in ${t1}ms`,
          )
          break
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
      const { $, elementType } = this.validateMutatedElement(element)
      if (!elementType) {
        continue
      }
      // Process the element depending on the determined type
      switch (elementType) {
        case 'post':
          const t0 = performance.now()
          const { isAd, profileId, retweetProfileId, postId } = processPostElement($)
          // Always hide ads :)
          if (isAd) {
            console.log(`hiding post ${profileId}/${postId} (Ad)`)
            element.classList.add('hidden')
            continue
          }
          // Mutate post element to add RANK vote buttons
          const [upvoteButton, downvoteButton] = addPostVoteButtons(element, {
            profileId,
            postId,
          } as ProcessedPostElement)
          // Fetch indexed post ranking from RANK API
          const { profile, ranking, votesPositive, votesNegative } =
            (await fetchRankApiData(profileId, postId)) as IndexedPostRanking
          const profileAvatar = element.querySelector(
            Selector.Twitter.Article.div.profileAvatar,
          )!
          /*
          // get profile-specific data/elements
          const profileRanking = BigInt(profile.ranking)
          profileAvatar.classList.add(
            profileRanking > DEFAULT_RANK_THRESHOLD
              ? 'profile-positive-reputation'
              : 'profile-negative-reputation',
          )
          // add this profile to the cache
          profileCache.set(profileId, {
            ...profile,
            ranking: profileRanking,
            avatar: profileAvatar as HTMLImageElement,
          })
          */
          // Update vote counts for the upvote/downvote buttons
          updatePostVoteButtonVoteCount(upvoteButton, votesPositive)
          updatePostVoteButtonVoteCount(downvoteButton, votesNegative)
          // Hide the post if below ranking
          const postRanking = BigInt(ranking)
          // add this post to the cache
          postCache.set(postId, {
            // Only cache the post article element, not its container
            element,
            ranking: postRanking,
            votesPositive,
            votesNegative,
          })
          const t1 = (performance.now() - t0).toFixed(3)
          console.log(`processed adding post ${profileId}/${postId} to cache in ${t1}ms`)
          checkPostRankingAndBlur(profileId, postId, postRanking)
          break
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
        const post = await fetch(`${DEFAULT_RANK_API}/twitter/${profileId}/${postId}`)
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
    ctx.onInvalidated(() => clearInterval(postVoteUpdateInterval))
    ctx.addEventListener(window, 'wxt:locationchange', () => {
      console.log('window location changed, resetting state')
      if (ctx.isInvalid) {
        ctx.notifyInvalidated()
        // Reset profile/post caches on page change
        profileCache.clear()
        postCache.clear()
      }
    })
    // Start observing Twitter's `react-node` for mutations
    new Mutator().startMutationObserver()
  },
})
