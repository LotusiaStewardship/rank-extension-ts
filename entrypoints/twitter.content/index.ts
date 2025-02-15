import { MatchPattern } from 'wxt/sandbox'
import { Parser } from '@/utils/parser'
import { Selector } from '@/utils/selector'
import { walletMessaging } from '@/entrypoints/background/messaging'
import type { ScriptChunkSentimentUTF8 } from 'rank-lib'
import $ from 'jquery'
import { DEFAULT_RANK_THRESHOLD, DEFAULT_RANK_API } from '@/utils/constants'
import { ROOT_URL, VOTE_ARROW_UP, VOTE_ARROW_DOWN } from './constants'
import './style.css'
/**
 *  Types
 */
/**  */
type ProfileSentiment = ScriptChunkSentimentUTF8 | 'neutral'
/**  */
type ValidElement =
  | 'post'
  | 'conversation'
  | 'notification'
  | 'profilePopup'
  | 'avatar'
  | 'avatarConversation'
  | 'button'
  | 'buttonRow'
  | 'ad'
  | null
/**  */
type ParsedPostData = {
  profileId: string
  postId: string
  retweetProfileId?: string
  quoteProfileId?: string
}
/** */
type CachedPost = {
  profileId: string
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
type PendingPostUpdateTarget = [
  string,
  JQuery<HTMLElement>,
  JQuery<HTMLButtonElement>,
  JQuery<HTMLButtonElement>,
  CachedPost,
]
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
  | 'message'
  | 'other'
/** Browser runs this when the configured `runAt` stage is reached */
export default defineContentScript({
  matches: ['https://*.x.com/*', 'https://x.com/*'],
  world: 'ISOLATED',
  // https://developer.chrome.com/docs/extensions/reference/api/extensionTypes#type-RunAt
  runAt: 'document_end',
  async main(ctx) {
    /**
     *  Constants
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
    /** Primary document root where mutations are observed */
    const documentRoot = $(Selector.Twitter.Container.div.root)
    /**
     *  Functions
     */
    /**
     * Creates a unique overlay button/span element for a blurred post
     * @param postId
     * @returns
     */
    const createOverlay = (postId: string): JQuery<HTMLButtonElement> => {
      // Set up overlay button, span
      const overlay = $(overlayButton.cloneNode() as HTMLButtonElement)
      const span = $(overlaySpan.cloneNode() as HTMLSpanElement)
      // return new overlay button with all required configuration
      return overlay
        .attr('data-postid', postId)
        .addClass('blurred-overlay')
        .on('click', overlay[0], handleBlurredOverlayButtonClick)
        .append(
          span
            .addClass('blurred-overlay-text')
            .html('Post has poor reputation, click to view'),
        )
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
        ? `${DEFAULT_RANK_API}/twitter/${profileId.toLowerCase()}/${postId}`
        : `${DEFAULT_RANK_API}/twitter/${profileId.toLowerCase()}`
      try {
        const result = await fetch(apiPath)
        const json = await result.json()
        return json as RankAPIResult
      } catch (e) {
        console.error(`fetchRankApiData`, e)
        // No ranking data found, so profile/post is a neutral rank
        // Backend API should return this by default; catch just in case
        return defaultRanking as RankAPIResult
      }
    }
    /**
     *
     * @param profileId
     */
    const updateCachedProfile = async (
      profileId: string,
    ): Promise<CachedProfile> => {
      // Create new cached entry for profileId if not already cached
      if (!profileCache.has(profileId)) {
        profileCache.set(profileId, {
          sentiment: 'neutral',
          ranking: DEFAULT_RANK_THRESHOLD,
          votesPositive: 0,
          votesNegative: 0,
        })
      }
      // Get reference to cached profile data object
      const cachedProfile = profileCache.get(profileId)!
      // Fetch profile data and set cache item
      const result = await fetchRankApiData(profileId)
      const ranking = BigInt(result.ranking)
      // Update the cached profile with API data
      cachedProfile.ranking = ranking
      cachedProfile.votesPositive = result.votesPositive
      cachedProfile.votesNegative = result.votesNegative
      if (ranking > DEFAULT_RANK_THRESHOLD) {
        cachedProfile.sentiment = 'positive'
      } else if (ranking < DEFAULT_RANK_THRESHOLD) {
        cachedProfile.sentiment = 'negative'
      } else {
        cachedProfile.sentiment = 'neutral'
      }

      return cachedProfile
    }
    /**
     *
     * @param postId
     * @returns {Promise<CachedPost>} The updated, cached post
     */
    const updateCachedPost = async (
      profileId: string,
      postId: string,
    ): Promise<CachedPost> => {
      if (!postCache.has(postId)) {
        postCache.set(postId, {
          profileId,
          ranking: DEFAULT_RANK_THRESHOLD,
          votesPositive: 0,
          votesNegative: 0,
        })
      }
      const cachedPost = postCache.get(postId)!
      if (!profileCache.has(profileId)) {
        profileCache.set(profileId, {
          sentiment: 'neutral',
          ranking: DEFAULT_RANK_THRESHOLD,
          votesPositive: 0,
          votesNegative: 0,
        })
      }
      const cachedProfile = profileCache.get(profileId)!
      const result = (await fetchRankApiData(
        profileId,
        postId,
      )) as IndexedPostRanking
      try {
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
      } catch (e) {
        console.warn(e)
      }
      // return the cached post for additional processing
      return cachedPost
    }
    /**
     * Iterate through cached posts and update their ranking, vote buttons, etc.
     */
    const updateCachedPosts = async () => {
      const avatars: Map<string, string[]> = new Map()
      // first update all cached posts with fresh API data
      for (const [postId, { profileId }] of postCache) {
        // skip updating posts that are processing vote button clicks
        if (postId == state.get('postIdBusy')) {
          continue
        }
        // interrupt if post cache update interval is disabled
        if (!state.get('postVoteUpdateInterval')) {
          break
        }
        try {
          // update the cached post
          await updateCachedPost(profileId, postId)
          // eslint-disable-next-line @typescript-eslint/no-unused-expressions
          avatars.has(profileId)
            ? avatars.get(profileId)!.push(postId)
            : avatars.set(profileId, [postId])
        } catch (e) {
          continue
        }
      }
      // mutate post elements with updated cache data and set profile avatar badges
      avatars.entries().forEach(async ([profileId, postIds]) => {
        // mutate elements for all posts that were updated
        postIds.forEach(postId => {
          const article = documentRoot.find(
            `article:has(button[data-postid="${postId}"])`,
          )
          const buttons = article.find(`button[data-postid="${postId}"]`)
          const upvoteButton = $(buttons[0] as HTMLButtonElement)
          const downvoteButton = $(buttons[1] as HTMLButtonElement)
          const cachedPost = postCache.get(postId)!
          // Update the vote counts on post vote buttons if greater than 0
          if (cachedPost.votesPositive > 0) {
            upvoteButton
              .find('span')
              .last()
              .html(cachedPost.votesPositive.toString())
          }
          if (cachedPost.votesNegative > 0) {
            downvoteButton
              .find('span')
              .last()
              .html(cachedPost.votesNegative.toString())
          }
          // check if post can be blurred, and then do so if necessary
          if (canBlurPost(postId, cachedPost)) {
            blurPost(article, profileId, postId, 'post reputation below threshold')
          }
        })
        // set all available profile avatar badges accordingly
        await processAvatarElements(
          documentRoot.find(`div[data-testid="UserAvatar-Container-${profileId}"]`),
          false,
        )
      })
    }
    /**
     *
     * @param avatar
     * @param sentiment
     * @returns
     */
    const setProfileAvatarBadge = (
      avatar: JQuery<HTMLElement>,
      sentiment: ProfileSentiment,
    ) => {
      const elementWidth = avatar?.css('width') ?? `${avatar[0].offsetWidth}px`
      // find the available element width in the style or the div element
      //const elementWidth = avatar?.style?.width || `${avatar?.offsetWidth}px`
      // Find the existing avatar badge class on the element to replace
      const className = avatar[0].classList
        .entries()
        .find(([, className]) => className.includes('reputation'))
      // New badge class that will be applied to the avatar element
      let newClassName = ''
      // Set the new class name according to the size of the avatar element
      switch (elementWidth) {
        // abort because cached element is no longer in the DOM
        case '0px': {
          return
        }
        // e.g. embedded post avatars
        case '24px': {
          // TODO: need to make a class for this one, then break instead of return
          return
        }
        // e.g. profile avatars on notifications such as likes
        case '32px': {
          newClassName = `notification-avatar-${sentiment}-reputation`
          break
        }
        // e.g. profile avatars on timeline posts
        case '40px': {
          newClassName = `post-avatar-${sentiment}-reputation`
          break
        }
        // e.g. post avatar popover (i.e. mouseover avatar)
        case '64px': {
          newClassName = `post-popup-avatar-${sentiment}-reputation`
          break
        }
        // Assume profile avatar on profile page
        default: {
          console.log('default avatar width', avatar[0].offsetWidth)
          newClassName = `profile-avatar-${sentiment}-reputation`
          break
        }
      }
      // set or replace the badge class on the avatar element
      return className
        ? avatar[0].classList.replace(className[1], newClassName)
        : avatar?.addClass(newClassName)
    }
    /**
     * Parse through the provided elements to gather `profileId`s and avatar elements, then set the
     * appropriate badge class on all avatar elements correlated to that profile
     * @param elements
     * @param updateProfile
     * @param type
     * @returns
     */
    const processAvatarElements = async (
      elements: JQuery<HTMLElement>,
      updateProfile: boolean = true,
      type?: AvatarElementType,
    ) => {
      // Parse elements for unique profileIds and collect associated avatar elements
      const map: Map<string, JQuery<HTMLElement>[]> = new Map()
      switch (type) {
        // we are only interested in a single avatar element and profileId
        case 'message': {
          const avatarDiv = elements
            .find(Selector.Twitter.Article.div.profileAvatar)
            .first()
          const avatarLink = elements
            .find(Selector.Twitter.Article.a.avatarConversation)
            .first()
          if (avatarDiv.length < 1 || avatarLink.length < 1) {
            console.warn('could not find profileId in elements', elements)
            return
          }
          const profileId = avatarLink.attr('href')!.split('/')[1]
          map.set(profileId, [avatarDiv])
          break
        }
        // most avatar elements don't need special handling to find profileId
        default: {
          elements.each((index, avatar) => {
            const avatarDiv = $(avatar)
            const profileId = avatarDiv.attr('data-testid')!.split('-').pop()!
            // eslint-disable-next-line @typescript-eslint/no-unused-expressions
            map.get(profileId)?.push(avatarDiv) ?? map.set(profileId, [avatarDiv])
            return
          })
          break
        }
      }
      // process all elements that were found
      map.forEach(async (avatars, profileId) => {
        // update the cached profile if specified, otherwise use cached data
        const cachedProfile = updateProfile
          ? await updateCachedProfile(profileId)
          : profileCache.get(profileId)!
        // set the badge on each avatar element that was found for this profile
        const { sentiment } = cachedProfile
        avatars.forEach(avatar => setProfileAvatarBadge(avatar, sentiment))
      })
    }
    /**
     * Parse post element to gather profileId, postId, and other data for fetching
     * reputation data and additional processing
     * @param element
     * @returns
     */
    const parsePostElement = (element: JQuery<HTMLElement>): ParsedPostData => {
      // Select elements
      const tweetTextDiv = element.find(Selector.Twitter.Article.div.tweetText)
      const tweetUserNameLink = element.find(
        Selector.Twitter.Article.a.tweetUserName,
      )
      const retweetUserNameLink = element.find(
        Selector.Twitter.Article.a.retweetUserName,
      )
      const postIdLink = element.find(Selector.Twitter.Article.a.tweetId).last()
      const quoteTweet = element.find(Selector.Twitter.Article.div.quoteTweet)
      const quoteUserNameDiv = element.find(
        Selector.Twitter.Article.div.quoteTweetUserName,
      )
      // Parse elements for text data
      const postText = Parser.Twitter.Article.postTextFromElement(tweetTextDiv)
      const profileId =
        Parser.Twitter.Article.profileIdFromElement(tweetUserNameLink)
      const quoteProfileId =
        Parser.Twitter.Article.quoteProfileIdFromElement(quoteUserNameDiv)
      const retweetProfileId =
        Parser.Twitter.Article.profileIdFromElement(retweetUserNameLink)
      const postId = Parser.Twitter.Article.postIdFromElement(postIdLink)

      const data = {} as ParsedPostData
      data.profileId = profileId as string
      data.postId = postId
      if (retweetProfileId) {
        data.retweetProfileId = retweetProfileId
      }
      if (quoteProfileId) {
        data.quoteProfileId = quoteProfileId
      }

      return data
    }
    /**
     * Mutate button rows with vote buttons (e.g. posts, photo/media viewer, etc.)
     * @param element
     * @param data
     * @returns
     */
    const mutateButtonRowElement = (
      element: JQuery<HTMLElement>,
      data: ParsedPostData,
    ): [JQuery<HTMLButtonElement>, JQuery<HTMLButtonElement>] => {
      // Get existing like/unlike button, container, and button row
      const origButton =
        element.has(Selector.Twitter.Article.button.tweetLikeButton).length > 0
          ? element.find(Selector.Twitter.Article.button.tweetLikeButton)
          : element.find(Selector.Twitter.Article.button.tweetUnlikeButton)
      const origButtonContainer = origButton.parent()
      // Create upvote button and its container
      const upvoteButtonContainer = $(origButtonContainer[0].cloneNode() as Element)
      const upvoteButton = $(origButton[0].cloneNode(true) as HTMLButtonElement)
      upvoteButton
        .attr({
          'data-testid': 'upvote',
          'data-postid': data.postId,
          'data-profileid': data.profileId,
          'data-sentiment': 'positive',
        })
        .on('click', upvoteButton[0], handlePostVoteButtonClick)
      upvoteButton.find('span').last().html('')
      const upvoteSvg = $(VOTE_ARROW_UP) as JQuery<HTMLOrSVGElement>
      const upvoteArrow = upvoteSvg.find('g path')
      upvoteButton.find('g path').attr('d', upvoteArrow.attr('d')!)
      upvoteButtonContainer.append(upvoteButton)
      // Create downvote button and its container
      const downvoteButtonContainer = $(
        origButtonContainer[0].cloneNode() as Element,
      )
      const downvoteButton = $(origButton[0].cloneNode(true) as HTMLButtonElement)
      downvoteButton
        .attr({
          'data-testid': 'downvote',
          'data-postid': data.postId,
          'data-profileid': data.profileId,
          'data-sentiment': 'negative',
        })
        .on('click', downvoteButton[0], handlePostVoteButtonClick)
      downvoteButton.find('span').last().html('')
      const downvoteSvg = $(VOTE_ARROW_DOWN) as JQuery<HTMLOrSVGElement>
      const downvoteArrow = downvoteSvg.find('g path')
      downvoteButton.find('g path').attr('d', downvoteArrow.attr('d')!)
      downvoteButtonContainer.append(downvoteButton)
      // Adjust the button row accordingly
      origButtonContainer.addClass('hidden')
      upvoteButtonContainer.insertBefore(origButtonContainer)
      downvoteButtonContainer.insertBefore(origButtonContainer)
      return [upvoteButton, downvoteButton]
    }
    const processCachedPost = async (cachedPost: CachedPost) => {}
    /**
     *
     * @param profileId
     * @param postId
     * @param reason
     */
    const hidePost = (profileId: string, postId: string, reason: string) => {
      console.log(
        `hiding post with ID ${postId} from profile ${profileId} (${reason})`,
      )
      // TODO: add jQuery for getting the div['cellInnerDiv'] element
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
     *
     * @param element The `article` element containing the post
     * @param profileId
     * @param postId
     * @param reason
     */
    const blurPost = (
      element: JQuery<HTMLElement>,
      profileId: string,
      postId: string,
      reason: string,
    ) => {
      // if element already blurred, don't continue
      if (element.parent().hasClass('blurred')) {
        return false
      }
      console.log(`blurring post ${profileId}/${postId} (${reason})`)
      // article element resets CSS classes on hover, thanks to Twitter javascript
      // so we blur the parent element instead, which achieves the same effect
      const overlay = createOverlay(postId)
      element.parent().addClass('blurred').parent().append(overlay)
      //postParentElement.parent()!.style.overflow = 'hidden !important'
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
    async function handleBlurredOverlayButtonClick(this: HTMLButtonElement) {
      $(this).prev().find('article').trigger('click')
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
      const sentiment = this.getAttribute(
        'data-sentiment',
      )! as ScriptChunkSentimentUTF8
      // skip auto-updating this post since it will be updated below
      state.set('postIdBusy', postId)
      console.log(`casting ${sentiment} vote for ${profileId}/${postId}`)
      try {
        const txid = await walletMessaging.sendMessage(
          'content-script:submitRankVote',
          {
            platform: 'twitter',
            profileId,
            sentiment,
            postId,
          },
        )
        console.log(
          `successfully cast ${sentiment} vote for ${profileId}/${postId}`,
          txid,
        )
      } catch (e) {
        console.warn(
          `failed to cast ${sentiment} vote for ${profileId}/${postId}`,
          e,
        )
      }
      //
      try {
        // load the button element into jQuery
        const button = $(this)
        // update cached post data from API
        const cachedPost = await updateCachedPost(profileId, postId)
        // Update the vote counts on the appropriate button
        if (sentiment == 'positive') {
          button.find('span').last().html(cachedPost.votesPositive.toString())
        } else if (sentiment == 'negative') {
          button.find('span').last().html(cachedPost.votesNegative.toString())
        } else {
          // TOOD: add more cases if more sentiments are added in the future
        }
        // get the article element associated with this vote button
        const article = button.closest('article')
        // if the post can be blurred, then proceed
        if (canBlurPost(postId, cachedPost)) {
          blurPost(article, profileId, postId, 'post reputation below threshold')
        }
        // update all available avatar elements for this profile with appropriate reputation badge
        await processAvatarElements(
          documentRoot.find(`div[data-testid="UserAvatar-Container-${profileId}"]`),
          false,
        )
      } catch (e) {
        console.warn(e)
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
          const removed: string[] = []
          // gather cached posts that are no longer in the DOM
          for (const [postId, { profileId }] of postCache) {
            if (documentRoot.has(`a[href*="/status/${postId}"]`).length < 1) {
              console.log(
                `removing post ${profileId}/${postId} from cache (missing from DOM)`,
              )
              removed.push(postId)
            }
          }
          // remove posts from cache if not in the DOM
          removed.forEach(postId => postCache.delete(postId))
          // Re-enable postCache update interval
          state.set(
            'postVoteUpdateInterval',
            setInterval(
              updateCachedPosts,
              postCache.size < 10 || postCache.size > 20
                ? 5000
                : postCache.size * 500,
            ),
          )
        }, 500),
      )
    })
    /** Observe the configured root node of the document and enforce profile/post rankings in the DOM */
    class Mutator {
      /** https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver */
      private observers: Map<'react-root', MutationObserver>
      /** https://wxt.dev/guide/essentials/content-scripts.html#dealing-with-spas */
      public urlPatterns: Map<
        'home' | 'notifications' | 'timeline' | 'post' | 'bookmarks' | 'messages',
        MatchPattern
      >
      /** Initial runtime setup */
      constructor() {
        // set up react-root observer
        this.observers = new Map()
        this.observers.set(
          'react-root',
          new MutationObserver(this.handleRootMutations),
        )
        // set URL patterns
        this.urlPatterns = new Map()
        const urlHome = `${ROOT_URL}/home`
        const urlNotifications = `${ROOT_URL}/notifications`
        const urlPost = `${ROOT_URL}/*/status/*`
        const urlBookmarks = `${ROOT_URL}/*/bookmarks`
        const urlTimeline = `${ROOT_URL}/*`
        const urlMessages = `${ROOT_URL}/messages`
        this.urlPatterns.set('home', new MatchPattern(urlHome))
        this.urlPatterns.set('notifications', new MatchPattern(urlNotifications))
        this.urlPatterns.set('post', new MatchPattern(urlPost))
        this.urlPatterns.set('bookmarks', new MatchPattern(urlBookmarks))
        this.urlPatterns.set('timeline', new MatchPattern(urlTimeline))
        this.urlPatterns.set('messages', new MatchPattern(urlMessages))
      }
      /** Begin observing the root node of the DOM for mutations */
      public startMutationObserver = () => {
        // Begin observing root node to find the timeline node
        console.log('connecting react-root observer')
        this.observers.get('react-root')!.observe(documentRoot[0], {
          childList: true,
          subtree: true,
          // TODO: use attribute mutation events for additional processing?
          attributeFilter: ['data-ranking', 'data-testid'],
        })
      }
      /**
       *
       * @param element
       * @returns
       */
      private isValidElement = (element: JQuery<HTMLElement>) => {
        //const $ = load(element.outerHTML)
        let elementType: ValidElement = null
        // element is from tweet timeline (home, bookmarks, etc.)
        if (
          element.attr('data-testid') == Selector.Twitter.Article.value.innerDiv &&
          element.has(Selector.Twitter.Article.div.tweet).length == 1
        ) {
          elementType = 'post'
        }
        // element is from notification timeline
        else if (
          element.attr('data-testid') == Selector.Twitter.Article.value.innerDiv &&
          element.has(Selector.Twitter.Article.div.notification).length == 1
        ) {
          elementType = 'notification'
        }
        // element is a conversation in the messages timeline
        else if (
          element.attr('data-testid') == Selector.Twitter.Article.value.innerDiv &&
          element.has(Selector.Twitter.Article.div.directMessage).length == 1
        ) {
          elementType = 'conversation'
        }
        // element is a profile hover popup
        else if (
          element.has(Selector.Twitter.Article.div.profilePopup).length == 1
        ) {
          elementType = 'profilePopup'
        }
        // element is the dumb Grok actions button
        else if (
          element.has(Selector.Twitter.Article.button.grokActions).length == 1
        ) {
          elementType = 'button'
        }
        // element contains an action button row (e.g. contains comment, repost, like buttons)
        else if (element.has(Selector.Twitter.Article.div.buttonRow).length == 1) {
          elementType = 'buttonRow'
        }
        // element contains a profile avatar in a conversation context (i.e. /messages URL)
        else if (
          (element.has(Selector.Twitter.Article.div.profileAvatarUnknown).length ==
            1 &&
            element.has(Selector.Twitter.Article.a.avatarConversation).length > 0) ||
          element.has(Selector.Twitter.Article.div.profileAvatarConversation)
            .length == 4
        ) {
          elementType = 'avatarConversation'
        }
        // element is a profile avatar
        else if (
          element.has(Selector.Twitter.Article.div.profileAvatar).length == 1 &&
          element.has(Selector.Twitter.Article.div.profileAvatarUnknown).length == 0
        ) {
          elementType = 'avatar'
        }
        return { elementType }
      }
      /**
       *
       * @param element
       */
      private handleAttributeChange = (element: JQuery<HTMLElement>) => {
        const value = element.attr('data-testid')!
        console.log('handleAttributeChange', value)
        // set profile avatar badge
        // This is useful when navigating from one profile's page to another
        if (
          value.includes(Selector.Twitter.Article.value.profileAvatar) ||
          value.includes(Selector.Twitter.Article.value.tweetUserAvatar)
        ) {
          const profileId =
            value.split('-').pop()! ??
            Parser.Twitter.Article.profileIdFromElement(
              element.find(Selector.Twitter.Article.a.tweetUserName),
            )!
          if (!profileId) {
            console.log('cannot get profileId from element; aborting avatar update')
            return
          }
          setProfileAvatarBadge(element, profileCache.get(profileId)!.sentiment)
        }
      }
      /**
       * Adjust runtime state and otherwise respond to events when interesting
       * elements are removed from the DOM
       * @param nodes
       */
      private handleRemovedNodes = async (nodes: NodeList) => {
        for (const node of nodes) {
          if (!(node as HTMLElement).outerHTML) {
            continue
          }
          const element = $(node as HTMLElement)
          const { elementType } = this.isValidElement(element)
          if (!elementType) {
            continue
          }
          const t0 = performance.now()
          switch (elementType) {
            case 'post': {
              try {
                const { profileId, retweetProfileId, postId } =
                  parsePostElement(element)
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
              // may not need to do anything here
              break
            case 'avatar':
              // may not need to do anything here
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
          if (!(node as HTMLElement).outerHTML) {
            continue
          }
          const element = $(node as HTMLElement)
          // don't continue if not valid elementType
          const { elementType } = this.isValidElement(element)
          if (!elementType) {
            continue
          }
          // Process the element depending on the determined type
          switch (elementType) {
            case 'post': {
              try {
                const t0 = performance.now()
                const { profileId, retweetProfileId, postId } =
                  parsePostElement(element)
                // Always hide ads :)
                if (element.has(Selector.Twitter.Article.div.ad).length) {
                  console.log(`hiding post ${profileId}/${postId} (Ad)`)
                  element.addClass('hidden')
                  continue
                }
                // mutate the post button row with vote buttons
                const [upvoteButton, downvoteButton] = mutateButtonRowElement(
                  element.find(Selector.Twitter.Article.div.buttonRow),
                  {
                    profileId,
                    postId,
                  } as ParsedPostData,
                )
                // Immediately update the post ranking and vote count with API data
                const cachedPost = await updateCachedPost(profileId, postId)
                const t1 = (performance.now() - t0).toFixed(3)
                console.log(
                  `processed adding post ${profileId}/${postId} to cache in ${t1}ms`,
                )
                // Update the vote counts on post vote buttons if greater than 0
                if (cachedPost.votesPositive > 0) {
                  upvoteButton
                    .find('span')
                    .last()
                    .html(cachedPost.votesPositive.toString())
                }
                if (cachedPost.votesNegative > 0) {
                  downvoteButton
                    .find('span')
                    .last()
                    .html(cachedPost.votesNegative.toString())
                }
                // blur the post if below rank threshold
                if (canBlurPost(postId, cachedPost)) {
                  blurPost(
                    element.find('article'),
                    profileId,
                    postId,
                    'post reputation below threshold',
                  )
                }
                // set appropriate reputation badge for the profile avatar in this post element
                // only need to set this individual badge when processing individual post
                await processAvatarElements(
                  element.find(Selector.Twitter.Article.div.profileAvatar).first(),
                  false,
                )
              } catch (e) {
                // ignore processing errors for now; just continue to next element
                console.warn('element processing failed', e)
                continue
              }
              break
            }
            case 'notification': {
              // Set all profile avatar badges for notification items
              // some notification elements can have several avatar elements
              await processAvatarElements(
                element.find(Selector.Twitter.Article.div.profileAvatar),
              )
              // TODO: hide notifications for low reputation accounts? can do more here
              break
            }
            case 'conversation': {
              await processAvatarElements(element, true, 'message')
              // TODO: add logic to sort this DM element in the main container (e.g. stampchat)
              break
            }
            case 'avatarConversation': {
              await processAvatarElements(element, true, 'message')
              break
            }
            case 'button':
              // hide the Grok actions button (top-right corner of post)
              element
                .find(Selector.Twitter.Article.button.grokActions)
                .addClass('hidden')
              break
            case 'buttonRow': {
              // find the first button row that contains the requisite data for processing
              const row = element
                .find(Selector.Twitter.Article.div.buttonRow)
                .has(`a[${Selector.Twitter.Article.attr.tweetId}]`)
                .first()
              // if we don't have a valid button row, then abort processing
              if (row.length < 1) {
                continue
              }
              // destructure index 1 and 3 for profileId and postId respectively
              const [, profileId, , postId] = row
                .find(`a[${Selector.Twitter.Article.attr.tweetId}]`)
                .attr('href')!
                .split('/')
              // mutate button row to add vote buttons
              const [upvoteButton, downvoteButton] = mutateButtonRowElement(row, {
                profileId,
                postId,
              } as ParsedPostData)
              // use cached post data if it's available, otherwise fetch and cache post data
              const { votesPositive, votesNegative } =
                postCache.get(postId) ?? (await updateCachedPost(profileId, postId))
              if (votesPositive > 0) {
                upvoteButton.find('span').last().html(votesPositive.toString())
              }
              if (votesNegative > 0) {
                downvoteButton.find('span').last().html(votesNegative.toString())
              }
              // some button rows (e.g. mediaViewer on mobile) have profile avatars
              // don't update cached profile data since that was done above
              await processAvatarElements(
                element.find(Selector.Twitter.Article.div.profileAvatar).first(),
                false,
              )
              break
            }
            case 'profilePopup':
            case 'avatar': {
              // hide the Grok profile summary button
              element
                .find(Selector.Twitter.Article.span.grokProfileSummary)
                ?.closest('button')
                ?.parent() // button container div
                ?.addClass('hidden')
              await processAvatarElements(
                element.find(Selector.Twitter.Article.div.profileAvatar),
              )
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
          switch (mutation.type) {
            case 'childList': {
              this.handleRemovedNodes(mutation.removedNodes)
              this.handleAddedNodes(mutation.addedNodes)
              return
            }
            case 'attributes': {
              this.handleAttributeChange($(mutation.target as HTMLElement))
              return
            }
            /*
           case 'characterData': {
             console.log('data change', mutation.target)
           }
           */
          }
        })
      }
    }
    const mutator = new Mutator()
    ctx.onInvalidated(() =>
      clearInterval(state.get('postVoteUpdateInterval') as NodeJS.Timeout),
    )
    // callback for handling URL changes
    ctx.addEventListener(window, 'wxt:locationchange', async ({ newUrl }) => {
      console.log('url changed to', newUrl.pathname)
      // trigger onInvalidated handler if context is invalid
      if (ctx.isInvalid) {
        ctx.notifyInvalidated()
      }
      // handle setting avatar badges after navigating to profile pages
      // remove beginning `/` for profileId
      const profileId = newUrl.pathname.substring(1)
      const avatars = documentRoot.find(
        `div[data-testid="UserAvatar-Container-${profileId}"]`,
      )
      if (avatars.length > 0) {
        await processAvatarElements(avatars, false)
      }
    })

    // Start observing Twitter's `react-node` for mutations
    mutator.startMutationObserver()
  },
})
