import { MatchPattern } from 'wxt/sandbox'
import { Parser } from '@/utils/parser'
import { Selector } from '@/utils/selector'
import { PostMeta, instanceStore } from '@/entrypoints/background/stores'
import { walletMessaging } from '@/entrypoints/background/messaging'
import type { ScriptChunkSentimentUTF8 } from 'rank-lib'
import { PLATFORMS } from 'rank-lib'
import $ from 'jquery'
import { DEFAULT_RANK_THRESHOLD, DEFAULT_RANK_API } from '@/utils/constants'
import { toMinifiedNumber } from '@/utils/functions'
import {
  CACHE_POST_ENTRY_EXPIRE_TIME,
  ROOT_URL,
  VOTE_ARROW_UP,
  VOTE_ARROW_DOWN,
} from './constants'
import './style.css'
/**
 *  Types
 */
/**  */
type ProfileSentiment = ScriptChunkSentimentUTF8 | 'neutral'
/** */
type MutationType = 'added' | 'removed'
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
  postMeta?: PostMeta
  cachedAt: number // time inserted into cache
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
  postMeta?: PostMeta
}
/** */
type RankAPIResult = IndexedRanking | IndexedPostRanking
/** */
type RankAPIErrorResult = {
  error: string
  params: Partial<IndexedRanking>
}
type StateKey = 'postIdBusy' | 'postUpdateTimeout' | 'postUpdateInterval'
type AvatarElementType = 'message' | 'other'
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
    const SELECTOR = Selector.Twitter
    const PARAMS = PLATFORMS['twitter']
    const SCRIPT_PAYLOAD = await walletMessaging.sendMessage(
      'content-script:getScriptPayload',
      undefined,
    )
    console.log('our wallet ID for API requests:', SCRIPT_PAYLOAD)
    const t0 = performance.now()
    const POST_META_CACHE = await instanceStore.getPostMetaCache(
      SCRIPT_PAYLOAD,
      'twitter',
    )
    const t1 = (performance.now() - t0).toFixed(3)
    console.log(
      `loaded POST_META_CACHE with ${POST_META_CACHE.size} entries in ${t1}ms`,
    )
    const os = await instanceStore.getOs()
    /** */
    const DEFAULT_RANKING: Partial<RankAPIResult> = {
      ranking: '0',
      votesPositive: 0,
      votesNegative: 0,
    }
    /** */
    const POST_CACHE: CachedPostMap = new Map()
    /** */
    const PROFILE_CACHE: CachedProfileMap = new Map()
    /** URL match patterns */
    const urlPost = new RegExp(/.*\/status\/[0-9]+/)
    const STATE: Map<StateKey, NodeJS.Timeout | string | null> = new Map()
    /** Overlay button that is used to reveal blurred posts */
    const OVERLAY_BUTTON = document.createElement('button')
    /** Overlay span to put text on the overlay button */
    const OVERLAY_SPAN = document.createElement('span')
    /** Primary document root where mutations are observed */
    const DOCUMENT_ROOT = $(SELECTOR.Container.div.root)
    /**
     *  Mutator classes
     */
    class AddedMutator {
      /**
       *
       * @param element
       * @returns
       */
      async processPost(element: JQuery<HTMLElement>) {
        if (
          element.attr('data-testid') == SELECTOR.Article.value.innerDiv &&
          element.has(SELECTOR.Article.div.tweet).length == 1
        ) {
          //console.log('processing post element', element)
          try {
            const { profileId, retweetProfileId, postId } =
              parsePostElement(element)
            // Always hide ads :) unless we're on the post URL
            if (
              element.has(SELECTOR.Article.div.ad).length == 1 &&
              !window.location.pathname.includes(postId)
            ) {
              console.log(`hiding post ${profileId}/${postId} (Ad)`)
              element.addClass('hidden')
              return
            }
          } catch (e) {
            // ignore processing errors for now; just continue to next element
            console.warn('failed to process post', e)
          }
        }
      }
      /**
       * IMPORTANT: we no longer need to manually set profile badges for this element
       * since we are now processing the element through all element checks
       *
       * TODO: hide notifications for low reputation accounts? can do more here
       * @param element
       */
      async processNotification(element: JQuery<HTMLElement>) {
        if (
          element.attr('data-testid') == SELECTOR.Article.value.innerDiv &&
          element.has(SELECTOR.Article.div.notification).length == 1
        ) {
          await processAvatarElements(
            element.find(SELECTOR.Article.div.profileAvatar),
          )
        }
      }
      /**
       * IMPORTANT: we no longer need to manually set profile badges for this element
       * since we are now processing the element through all element checks
       * @param element
       */
      async processConversation(element: JQuery<HTMLElement>) {
        if (
          element.attr('data-testid') == SELECTOR.Article.value.innerDiv &&
          element.has(SELECTOR.Article.div.directMessage).length == 1
        ) {
          // process avatars found in the DM rows displayed in the `/messages` URL
          await processAvatarElements(element, 'message')
        }
      }
      /**
       *
       * @param element
       */
      async processProfilePopup(element: JQuery<HTMLElement>) {
        if (element.has(SELECTOR.Article.div.profilePopup).length != 1) {
          return
        }
        //console.log('processing profilePopup element', element)
        // ensure the popup avatar has its badge set
        //this.processAvatars(element)
        // hide the Grok profile summary button
        // this will generally come as a fallthrough from the `profilePopup` case
        //element
        //  .find(SELECTOR.Article.button.grokProfileSummary)
        //  ?.parent()
        //  ?.addClass('hidden')
      }
      /**
       *
       * @param element
       */
      async processPrimaryColumn(element: JQuery<HTMLElement>) {
        //console.log('processing primaryColumn element', element)
        // first need to process the profile avatar badge
        // this will force an update from the API to get vote/ranking stats
        await this.processAvatars(element)
        // find and hide the appropriate buttons
        await this.processButtons(element)
        // TODO: could probably do more here in the future
      }
      /**
       *
       * @param element
       */
      async processButtonRows(element: JQuery<HTMLElement>) {
        if (
          // need at least 1 button row element to proceed
          element.has(SELECTOR.Article.div.buttonRow).length != 1 ||
          // bugfix: some race condition on mobile duplicated vote buttons
          // this makes sure we don't process button rows we've already mutated
          element.has(
            [
              SELECTOR.Article.button.postUpvoteButton,
              SELECTOR.Article.button.postDownvoteButton,
            ].join(', '),
          ).length
        ) {
          return
        }
        //console.log('processing button row element', element)
        // find all button rows in current element
        const rows = element.find(SELECTOR.Article.div.buttonRow)
        // if we don't have a valid button row, then abort processing
        if (!rows.length) {
          console.warn('no button row found in element', element)
          return
        }
        // process each found button row
        rows.map(async (i, row) => processButtonRowElement($(row)))
      }
      /**
       *
       * @param element
       */
      async processButtons(element: JQuery<HTMLElement>) {
        // hide the Grok actions button (top-right corner of post)
        if (element.has(SELECTOR.Article.button.grokActions).length > 0) {
          //console.log('processing button elements', element)
          element.find(SELECTOR.Article.button.grokActions).addClass('hidden')
        }
        // hide the Grok profile summary buttons
        if (
          element.has(SELECTOR.Article.button.grokProfileSummary).length > 0
        ) {
          //console.log('processing button elements', element)
          element
            // main button
            .find(SELECTOR.Article.button.grokProfileSummary)
            .addClass('hidden')
            // big button in profile popup
            .has(SELECTOR.Article.span.grokProfileSummary)
            ?.parent()
            .addClass('hidden')
        }
      }
      /**
       *
       * @param element
       */
      async processAvatarConversation(element: JQuery<HTMLElement>) {
        if (
          //window.location.pathname.includes('message') &&
          element
            //.has(SELECTOR.Article.a.avatarConversation)
            .find(SELECTOR.Article.div.profileAvatarConversation).length == 1
        ) {
          //console.log('processing message avatars avatar in element', element)
          // process avatars found in other message divs, e.g. navbar
          processAvatarElements(element, 'message')
        }
      }
      /**
       *
       * @param element
       */
      async processAvatars(element: JQuery<HTMLElement>) {
        if (element.has(SELECTOR.Article.div.profileAvatar).length > 0) {
          //console.log('processing avatars in element', element)
          processAvatarElements(
            element.find(SELECTOR.Article.div.profileAvatar),
          )
        }
      }
      /**
       *
       * @param element
       */
      async processProfileStats(element: JQuery<HTMLElement>) {
        if (
          element.has(SELECTOR.Article.div.profileStats).length == 1 ||
          element.is(SELECTOR.Article.div.profileStats)
        ) {
          console.log('processing profileStats element', element)
          //const statsDiv = element.find(SELECTOR.Article.div.profileStats)
          // update profile avatar badge
          //processAvatarElements(statsDiv.find(SELECTOR.Article.div.profileAvatar))
          // find the row containing the following/follower links
          const profileUserNameElement = element.find(
            `div[${SELECTOR.Article.attr.profileUserName}]`,
          )
          //console.log('profileUserNameElement', profileUserNameElement)
          console.log(profileUserNameElement)
          const profileId = $('span:contains("@")', profileUserNameElement)
            .html()
            .substring(1)
          //console.log(profileId)
          const row = profileUserNameElement.siblings(
            `:has(${SELECTOR.Article.a.profileFollowing})`,
          )
          if (!row.length) {
            console.warn(
              'primaryColumn did not have profile following/follower stats',
              row,
            )
          }
          console.log(row)
          console.log(PROFILE_CACHE.get(profileId), profileId)
          // get cached profile
          const { votesPositive, votesNegative, ranking } =
            PROFILE_CACHE.get(profileId)! ??
            (await updateCachedProfile(profileId))
          // set up rank stats row
          const statsRow = $(row[0].cloneNode() as HTMLElement)
          ;[votesPositive, votesNegative, ranking].forEach((stat, i) => {})
          /*
          const mutatedStatsRow = statsRow
            .prop('style', 'margin-top: 0.8em;')
            .find('a')
            .prop('href', `https://rank.lotusia.org/api/v1/twitter/${profileId}`)
            .each((index, spanContainer) => {
              const container = $(spanContainer)
              switch (index) {
                case 0:
                  $('span:first', container)[0].innerHTML =
                    toMinifiedNumber(votesPositive)
                  $('span:last', container)[0].innerHTML = 'Upvotes'
                  return
                case 1:
                  $('span:first', container)[0].innerHTML =
                    toMinifiedNumber(votesNegative)
                  $('span:last', container)[0].innerHTML = 'Downvotes'
                  return
              }
            })
            */
          console.log('statsRow', statsRow)
          statsRow.insertAfter(row)
          //statsRow.insertAfter(row)
        }
      }
      /**
       *
       * @param element
       */
      async processGrokElements(element: JQuery<HTMLElement>) {
        // Grok scroll list embedded in post element
        if (element.has(SELECTOR.Article.div.grokScrollList).length == 1) {
          element
            .find(SELECTOR.Article.div.grokScrollList)
            ?.parent()
            .addClass('hidden')
        }
        // hovering grok drawer found on home page (and possibly elsewhere)
        if (element.has(SELECTOR.Article.div.grokDrawer).length == 1) {
          element.find(SELECTOR.Article.div.grokDrawer)?.addClass('hidden')
        }
      }
    }
    /**
     *
     */
    class RemovedMutator {
      /**
       *
       * @param element
       */
      async processPost(element: JQuery<HTMLElement>) {
        try {
          //const t0 = performance.now()
          const { profileId, retweetProfileId, postId } =
            parsePostElement(element)
          // Get the postId and delete the post from the cache
          POST_CACHE.delete(postId)
          //const t1 = (performance.now() - t0).toFixed(3)
          //console.log(
          //  `processed removing post ${profileId}/${postId} from cache in ${t1}ms`,
          //)
        } catch (e) {
          // ignore processing errors for now; just continue to next element
        }
      }
      async processNotification(element: JQuery<HTMLElement>) {}
      async processConversation(element: JQuery<HTMLElement>) {}
      async processProfilePopup(element: JQuery<HTMLElement>) {}
      async processPrimaryColumn(element: JQuery<HTMLElement>) {}
      async processButtonRows(element: JQuery<HTMLElement>) {}
      async processButtons(element: JQuery<HTMLElement>) {}
      async processAvatarConversation(element: JQuery<HTMLElement>) {}
      async processAvatars(element: JQuery<HTMLElement>) {}
      async processProfileStats(element: JQuery<HTMLElement>) {}
      async processGrokElements(element: JQuery<HTMLElement>) {}
    }
    /**
     *  Timers
     */
    /** Timeout to react to document scroll and clear/set post update interval */
    STATE.set('postUpdateTimeout', null)
    /** Interval to update cached post/profile rankings */
    STATE.set(
      'postUpdateInterval',
      setInterval(updateCachedPosts, CACHE_POST_ENTRY_EXPIRE_TIME),
    )
    /**
     *  Event Registrations
     */
    /*
    ctx.onInvalidated(() =>
      clearInterval(STATE.get('postUpdateInterval') as NodeJS.Timeout),
    )
    */
    // callback for handling URL changes
    ctx.addEventListener(window, 'wxt:locationchange', async ({ newUrl }) => {
      //console.log('url changed to', newUrl.pathname)
      // trigger onInvalidated handler if context is invalid
      if (ctx.isInvalid) {
        ctx.notifyInvalidated()
      }
    })
    /** */
    document.addEventListener('scroll', () => {
      // interrupt auto post updating immediately on scroll
      clearInterval(STATE.get('postUpdateInterval') as NodeJS.Timeout)
      clearTimeout(STATE.get('postUpdateTimeout') as NodeJS.Timeout)
      // Set new scroll timeout
      STATE.set(
        'postUpdateTimeout',
        setTimeout(() => {
          // clean out cached posts that don't exist in the DOM
          POST_CACHE.forEach(async ({ profileId }, postId) => {
            if (
              !DOCUMENT_ROOT.has(`a[href*="/status/${postId}"]`).length &&
              !window.location.pathname.includes(postId)
            ) {
              //console.log(
              //  `removing post ${profileId}/${postId} from cache (missing from DOM)`,
              //)
              POST_CACHE.delete(postId)
            }
          })
          // Re-enable postCache update interval
          STATE.set(
            'postUpdateInterval',
            setInterval(updateCachedPosts, CACHE_POST_ENTRY_EXPIRE_TIME),
          )
        }, 500),
      )
    })
    /**
     *
     *  Runtime Activation
     *
     */
    // instantiate the mutator classes for processing mutations
    const mutators = {
      added: new AddedMutator(),
      removed: new RemovedMutator(),
    }
    console.log('connecting react-root observer')
    new MutationObserver(handleRootMutations).observe(DOCUMENT_ROOT[0], {
      childList: true,
      subtree: true,
      attributeFilter: ['data-ranking', 'data-testid', 'href'],
    })
    /**
     *  Functions
     */
    /**
     * Create a unique button to overlay a blurred post
     * @param postId
     * @returns
     */
    function createOverlay(postId: string): JQuery<HTMLButtonElement> {
      // Set up overlay button, span
      const overlay = $(OVERLAY_BUTTON.cloneNode() as HTMLButtonElement)
      const span = $(OVERLAY_SPAN.cloneNode() as HTMLSpanElement)
      // return new overlay button with all required configuration
      return overlay
        .on(
          {
            click: handleBlurredOverlayButtonClick,
          },
          null,
          postId,
        )
        .append(span.html('Post has poor reputation, click to view'))
    }
    /**
     * Fetch ranking statistics for `profileId` from API. If `postId` is provided, then
     * ranking statistics for the post will be fetched instead.
     *
     * If both a `profileID` and `postId` are specified, the return data will be for the
     * `postId`, but an object with the `profile` property will also contain up-to-date
     * ranking statistics for the `profileId`.
     * @param profileId
     * @param postId
     * @returns
     */
    async function fetchRankApiData(
      profileId: string,
      postId?: string,
      SCRIPT_PAYLOAD?: string,
    ): Promise<RankAPIResult> {
      const apiPath = postId
        ? `${DEFAULT_RANK_API}/twitter/${profileId.toLowerCase()}/${postId}/${SCRIPT_PAYLOAD}`
        : `${DEFAULT_RANK_API}/twitter/${profileId.toLowerCase()}`
      try {
        const result = await fetch(apiPath)
        const json = await result.json()
        return json as RankAPIResult
      } catch (e) {
        console.error(`fetchRankApiData`, e)
        // No ranking data found, so profile/post is a neutral rank
        // Backend API should return this by default; catch just in case
        return DEFAULT_RANKING as RankAPIResult
      }
    }
    /**
     *
     * @param profileId
     */
    async function updateCachedProfile(
      profileId: string,
      data?: RankAPIResult,
    ): Promise<CachedProfile> {
      // Use provied profile rank data from a post update, otherwise fetch from API
      const result = data ?? (await fetchRankApiData(profileId))
      const ranking = BigInt(result.ranking)
      // set up profile cache data
      const profileData = {} as CachedProfile
      profileData.ranking = ranking
      profileData.votesPositive = result.votesPositive
      profileData.votesNegative = result.votesNegative
      if (ranking > DEFAULT_RANK_THRESHOLD) {
        profileData.sentiment = 'positive'
      } else if (ranking < DEFAULT_RANK_THRESHOLD) {
        profileData.sentiment = 'negative'
      } else {
        profileData.sentiment = 'neutral'
      }

      PROFILE_CACHE.set(profileId, profileData)
      return PROFILE_CACHE.get(profileId)!
    }
    /**
     * Check the timestamp of a cached post entry against current time. Returns `true`
     * if post has exceeded the default expiry time or timestamp is undefined, `false` otherwise.
     * @param timestamp
     * @returns
     */
    function isPostExpired(cachedAt: number | undefined) {
      return cachedAt
        ? Date.now() - cachedAt > CACHE_POST_ENTRY_EXPIRE_TIME
        : true
    }
    function toPostMetaKey(profileId: string, postId: string) {
      return `${profileId}:${postId}`
    }
    /**
     *
     * @param profileId
     * @param postId
     * @returns
     */
    async function updateCachedPost(
      profileId: string,
      postId: string,
      setPostMeta?: true,
    ): Promise<CachedPost> {
      try {
        // update cached post entry with API data
        const result = (await fetchRankApiData(
          profileId,
          postId,
          SCRIPT_PAYLOAD,
        )) as IndexedPostRanking
        // check if cached data differs from API data, then update
        POST_CACHE.set(postId, {
          profileId,
          ranking: BigInt(result.ranking),
          votesPositive: result.votesPositive,
          votesNegative: result.votesNegative,
          postMeta: result.postMeta,
          cachedAt: Date.now(),
        })
        // update cached profile with data received from API
        await updateCachedProfile(profileId, result.profile)
        // save updated metadata if avilable and specified to do so
        if (
          result.postMeta &&
          setPostMeta &&
          !POST_META_CACHE.get(toPostMetaKey(profileId, postId))
        ) {
          instanceStore.setPostMeta(
            SCRIPT_PAYLOAD,
            'twitter',
            profileId,
            postId,
            result.postMeta,
          )
        }
      } catch (e) {
        console.warn(e)
      }
      // return the cached post for additional processing
      return POST_CACHE.get(postId)!
    }
    /**
     * Update ranking statistics for cached posts and update DOM elements accordingly.
     * This function is executed after `CACHE_POST_ENTRY_EXPIRE_TIME` interval
     */
    async function updateCachedPosts() {
      POST_CACHE.forEach(async ({ profileId }, postId) => {
        // skip updating posts that are processing vote button handlers
        if (postId == STATE.get('postIdBusy')) {
          return
        }
        try {
          // update cached post with API data
          const cachedPost = await updateCachedPost(profileId, postId)
          const { votesPositive, votesNegative, ranking, postMeta } = cachedPost
          // set all available profile avatar badges accordingly
          processAvatarElements(
            DOCUMENT_ROOT.find(
              `div[data-testid="UserAvatar-Container-${profileId}"]`,
            ),
          )
          // Update the vote counts on post vote buttons if necessary
          const voteButtons = DOCUMENT_ROOT.find(
            `button[data-postid="${postId}"]`,
          )
          const [upvoteButton, downvoteButton] = voteButtons
          if (postMeta?.hasWalletUpvoted) {
            $(upvoteButton).attr('aria-label', 'Upvoted')
          }
          if (votesPositive > 0) {
            const upvoteSpan = $('span:last', upvoteButton)
            const upvoteCount = toMinifiedNumber(votesPositive)
            if (upvoteSpan.html() !== upvoteCount) {
              upvoteSpan.html(upvoteCount)
            }
          }
          if (postMeta?.hasWalletDownvoted) {
            $(downvoteButton).attr('aria-label', 'Downvoted')
          }
          if (votesNegative > 0) {
            const downvoteSpan = $('span:last', downvoteButton)
            const downvoteCount = toMinifiedNumber(votesNegative)
            if (downvoteSpan.html() !== downvoteCount) {
              downvoteSpan.html(downvoteCount)
            }
          }
          // check if post can be blurred, and then do so if necessary
          const article = voteButtons.closest('article')
          if (article.length) {
            processPostBlurAction(
              article.parent().parent(),
              profileId,
              postId,
              ranking,
            )
          }
          return [postId, cachedPost]
        } catch (e) {
          // skip to next post if we fail here
        }
      })
    }
    /**
     * Set the badge on the provided `avatar` element(s) according to its width
     * @param avatar
     * @returns
     */
    function setProfileAvatarBadge(avatar: JQuery<HTMLElement>) {
      const elementWidth = avatar?.css('width') ?? `${avatar[0].offsetWidth}px`
      // find the available element width in the style or the div element
      //const elementWidth = avatar?.style?.width || `${avatar?.offsetWidth}px`
      // Find the existing avatar badge class on the element to replace
      const className = avatar
        .prop('class')
        .split(/\s/)
        .filter((c: string) => c.includes('reputation'))
      // New badge class that will be applied to the avatar element
      let newClassName = ''
      // Set the new class name according to the size of the avatar element
      switch (elementWidth) {
        // abort because cached element is no longer in the DOM
        case '0px':
          return
        // e.g. embedded post avatars (i.e. quote tweets)
        case '24px':
        // e.g. profile avatars on notifications such as likes
        // // eslint-disable-next-line no-fallthrough
        case '32px': {
          newClassName = `notification-avatar-reputation`
          break
        }
        // e.g. profile avatars on timeline posts
        case '40px': {
          newClassName = `post-avatar-reputation`
          break
        }
        // e.g. post avatar popover (i.e. mouseover avatar)
        case '64px': {
          newClassName = `post-popup-avatar-reputation`
          break
        }
        default: {
          console.log('default avatar width', avatar[0].offsetWidth)
          newClassName = `profile-avatar-reputation`
          break
        }
      }
      // set or replace the badge class on the avatar element
      return className.length
        ? avatar[0].classList.replace(className[0], newClassName)
        : avatar?.addClass(newClassName)
    }
    /**
     * Parse through the provided elements to gather `profileId`s and avatar elements, then set the
     * appropriate badge class on all avatar elements correlated to that profile
     * @param elements
     * @param type
     * @returns
     */
    async function processAvatarElements(
      elements: JQuery<HTMLElement>,
      type?: AvatarElementType,
    ) {
      // Parse elements for unique profileIds and collect associated avatar elements
      const map: Map<string, JQuery<HTMLElement>[]> = new Map()
      switch (type) {
        case 'message': {
          // we are only interested in a single avatar element and profileId
          const avatarDiv = elements
            .find(SELECTOR.Article.div.profileAvatarUnknown)
            .first()
          const avatarLink = elements
            .find(SELECTOR.Article.a.avatarConversation)
            .first()
          if (avatarDiv.length < 1 || avatarLink.length < 1) {
            //console.warn('did not find profileId in message avatar element', elements)
            return
          }
          const profileId = avatarLink.attr('href')!.split('/')[1]
          // only proceed with setting badge if setting new reputation
          if (
            avatarDiv.attr('data-sentiment') &&
            avatarDiv.attr('data-sentiment') ==
              PROFILE_CACHE.get(profileId)?.sentiment
          ) {
            return
          }
          map.set(profileId, [avatarDiv])
          break
        }
        // most avatar elements don't need special handling to find profileId
        default: {
          elements.each((index, avatar) => {
            const avatarDiv = $(avatar)
            const profileId = avatarDiv.attr('data-testid')!.split('-').pop()!
            // only proceed with setting badge if setting new reputation
            if (
              avatarDiv.attr('data-sentiment') &&
              avatarDiv.attr('data-sentiment') ==
                PROFILE_CACHE.get(profileId)?.sentiment
            ) {
              return
            }
            // eslint-disable-next-line @typescript-eslint/no-unused-expressions
            map.get(profileId)?.push(avatarDiv) ??
              map.set(profileId, [avatarDiv])
          })
          break
        }
      }
      // process all elements that were found
      map.forEach(async (avatars, profileId) => {
        try {
          // set the badge on each avatar element that was found for this profile
          avatars.forEach(async avatar => {
            // get cached profile data or fetch from API, then get sentiment value
            const sentiment = (
              PROFILE_CACHE.get(profileId) ??
              (await updateCachedProfile(profileId))
            ).sentiment
            // set data-sentiment attribute on the avatar div element for CSS class
            avatar.attr('data-sentiment', sentiment)
            // set the appropriate CSS class for the element width
            setProfileAvatarBadge(avatar)
          })
        } catch (e) {
          // warn and skip
          console.warn('failed to set avatar badge', profileId, avatars, e)
          return
        }
      })
    }
    /**
     *
     * @param element
     */
    async function processButtonRowElement(element: JQuery<HTMLElement>) {
      try {
        const postButtonRow = element.closest(SELECTOR.Article.div.innerDiv)
        const postIdLink = (
          postButtonRow.length ? postButtonRow : element
        ).find(`a[${SELECTOR.Article.attr.tweetId}]:last`)
        // sometimes a full-screen photo has a button row without the post URL in href attribute
        // in this case, assume our browser is on the post URL page and use this for the info
        const [, profileId, , postId] =
          postIdLink?.attr('href')?.split('/') ??
          window.location.pathname.split('/')
        // validate the data we parsed

        // load cached post metadata if we have it
        const cachedPostMeta = POST_META_CACHE.get(
          toPostMetaKey(profileId, postId),
        )!
        // mutate button row to add vote buttons
        const [upvoteButton, downvoteButton] = mutateButtonRowElement(
          element,
          profileId,
          postId,
          cachedPostMeta,
        )
        // use cached post data if it's available, otherwise fetch and cache post data
        const { votesPositive, votesNegative, ranking, postMeta } =
          !isPostExpired(POST_CACHE.get(postId)?.cachedAt)
            ? POST_CACHE.get(postId)!
            : await updateCachedPost(profileId, postId, true)
        // update post vote buttons after fetching updated post data from API
        if (postMeta?.hasWalletUpvoted) {
          upvoteButton.attr('aria-label', 'Upvoted')
        }
        if (votesPositive > 0) {
          const upvoteSpan = upvoteButton.find('span:last')
          const upvoteCount = toMinifiedNumber(votesPositive)
          if (upvoteSpan.html() !== upvoteCount) {
            upvoteSpan.html(upvoteCount)
          }
        }
        if (postMeta?.hasWalletDownvoted) {
          downvoteButton.attr('aria-label', 'Downvoted')
        }
        if (votesNegative > 0) {
          const downvoteSpan = downvoteButton.find('span:last')
          const downvoteCount = toMinifiedNumber(votesNegative)
          if (downvoteSpan.html() !== downvoteCount) {
            downvoteSpan.html(downvoteCount)
          }
          downvoteButton.find('span:last').html(toMinifiedNumber(votesNegative))
        }
        // some button rows are part of post elements (i.e. have parent article element)
        const article = element.closest('article')
        if (article.length) {
          processPostBlurAction(
            article.parent().parent(),
            profileId,
            postId,
            ranking,
          )
        }
        // some button rows (e.g. mediaViewer on mobile) have profile avatars
        //await processAvatarElements(element.find(SELECTOR.Article.div.profileAvatar))
      } catch (e) {
        //console.warn('failed to process button row element', element, e)
      }
    }
    /**
     * Parse post element to gather profileId, postId, and other data for fetching
     * reputation data and additional processing
     * @param element
     * @returns
     */
    function parsePostElement(element: JQuery<HTMLElement>): ParsedPostData {
      // Select elements
      //const tweetTextDiv = element.find(SELECTOR.Article.div.tweetText)
      //const retweetUserNameLink = element.find(SELECTOR.Article.a.retweetUserName)
      //const quoteTweet = element.find(SELECTOR.Article.div.quoteTweet)
      //const quoteUserNameDiv = element.find(SELECTOR.Article.div.quoteTweetUserName)
      // Parse elements for text data
      //const postText = Parser.Twitter.Article.postTextFromElement(tweetTextDiv)

      const profileId = Parser.Twitter.Article.profileIdFromElement(
        element.find(SELECTOR.Article.a.tweetUserName),
      )
      //const quoteProfileId =
      //  Parser.Twitter.Article.quoteProfileIdFromElement(quoteUserNameDiv)
      //const retweetProfileId =
      //  Parser.Twitter.Article.profileIdFromElement(retweetUserNameLink)
      const postId = Parser.Twitter.Article.postIdFromElement(
        element.find(SELECTOR.Article.a.tweetId).last(),
      )

      const data = {} as ParsedPostData
      data.profileId = profileId as string
      data.postId = postId
      /*
      if (retweetProfileId) {
        data.retweetProfileId = retweetProfileId
      }
      if (quoteProfileId) {
        data.quoteProfileId = quoteProfileId
      }
      */
      return data
    }
    /**
     * Mutate button rows with vote buttons (e.g. posts, photo/media viewer, etc.)
     * @param element
     * @param data
     * @returns
     */
    function mutateButtonRowElement(
      element: JQuery<HTMLElement>,
      profileId: string,
      postId: string,
      postMeta?: PostMeta,
    ): [JQuery<HTMLButtonElement>, JQuery<HTMLButtonElement>] {
      // the like/unlike button will be the 3rd div element in the row
      const origButton = element.find(
        `div:nth-child(3) button:not([data-sentiment])`,
      )
      if (origButton.length < 1) {
        throw new Error('button row already mutated')
      }
      const origButtonContainer = origButton.parent()
      // Create upvote button and its container
      const upvoteButtonContainer = origButtonContainer.clone(true, true) // $(origButtonContainer[0].cloneNode() as Element)
      const upvoteButton = upvoteButtonContainer.find(
        'button:first',
      ) as JQuery<HTMLButtonElement> // $(origButton[0].cloneNode(true) as HTMLButtonElement)
      upvoteButton
        .attr({
          //'data-testid': 'upvote',
          'data-profileid': profileId,
          'data-postid': postId,
          'data-sentiment': 'positive',
        })
        .removeAttr('aria-disabled')
        .removeProp('disabled')
        .addClass('upvote-button')
        .on(
          {
            click: handlePostVoteButtonClick,
          },
          null,
        )
      if (postMeta?.hasWalletUpvoted) {
        upvoteButton.attr(`aria-label`, `Upvoted`)
        //upvoteButton.find('div:first').addClass('upvote-button')
      }
      upvoteButton
        .find('span:last')
        .html(String(postMeta?.txidsUpvoted.length || ''))
      const upvoteSvg = $(VOTE_ARROW_UP) as JQuery<HTMLOrSVGElement>
      const upvoteArrow = upvoteSvg.find('g path')
      upvoteButton.find('g path').attr('d', upvoteArrow.attr('d')!)
      upvoteButtonContainer.append(upvoteButton)
      // Create downvote button and its container
      const downvoteButtonContainer = origButtonContainer.clone(true, true) // $(origButtonContainer[0].cloneNode() as Element)
      const downvoteButton = downvoteButtonContainer.find(
        'button:first',
      ) as JQuery<HTMLButtonElement> // $(origButton[0].cloneNode(true) as HTMLButtonElement)
      downvoteButton
        .attr({
          //'data-testid': 'downvote',
          'data-profileid': profileId,
          'data-postid': postId,
          'data-sentiment': 'negative',
        })
        .removeAttr('aria-disabled')
        .removeProp('disabled')
        .addClass('downvote-button')
        .on(
          {
            click: handlePostVoteButtonClick,
          },
          null,
        )
      if (postMeta?.hasWalletDownvoted) {
        downvoteButton.attr('aria-label', 'Downvoted')
        //downvoteButton.find('div:first').addClass('downvote-button')
      }
      downvoteButton
        .find('span:last')
        .html(String(postMeta?.txidsDownvoted.length || ''))
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
    /**
     *
     * @param profileId
     * @param postId
     * @param reason
     */
    function handlePostHideAction(
      profileId: string,
      postId: string,
      reason: string,
    ) {
      console.log(
        `hiding post with ID ${postId} from profile ${profileId} (${reason})`,
      )
      // TODO: add jQuery for getting the div['cellInnerDiv'] element
    }
    /**
     *
     * @param element
     * @param profileId
     * @param postId
     * @param ranking
     * @returns
     */
    function processPostBlurAction(
      element: JQuery<HTMLElement>,
      profileId: string,
      postId: string,
      ranking: bigint,
    ) {
      // abort if we're on the post's URL
      if (window.location.pathname.includes(postId)) {
        return
      }
      // if post ranking is above default threshold, don't blur
      if (ranking < DEFAULT_RANK_THRESHOLD) {
        // post is aleady blurred, so don't do it again
        if (element.hasClass('blurred')) {
          return
        }
        // if element already blurred, don't continue
        console.log(
          `blurring post ${profileId}/${postId} (post reputation below threshold)`,
        )
        // article element resets CSS classes on hover, thanks to Twitter javascript
        // so we blur the parent element instead, which achieves the same effect
        const overlay = createOverlay(postId)
        element.addClass('blurred').append(overlay)
        //postParentElement.parent()!.style.overflow = 'hidden !important'
      }
      // otherwise unblur the post
      else {
        // post isn't already blurred, so don't unblur
        if (!element.hasClass('blurred')) {
          return
        }
        console.log(
          `unblurring post ${profileId}/${postId} (post reputation at or above treshold)`,
        )
        element.removeClass('blurred').next().remove()
        //postParentElement.parent()!.style.overflow = 'hidden !important'
      }
    }
    /**
     *
     * @param this
     */
    async function handleBlurredOverlayButtonClick(this: HTMLButtonElement) {
      // button overlay is appended as next sibling to div containing the post article element
      $(this).prev().find('article').trigger('click')
    }
    /**
     *
     * @param this
     */
    async function handlePostVoteButtonClick(this: HTMLButtonElement) {
      // disable the button first
      this.disabled = true
      // gather required data for submitting vote to Lotus network
      const profileId = this.getAttribute('data-profileid')!
      const postId = this.getAttribute('data-postid')!
      const sentiment = this.getAttribute(
        'data-sentiment',
      )! as ScriptChunkSentimentUTF8
      // skip auto-updating this post since it will be updated below
      STATE.set('postIdBusy', postId)
      console.log(`casting ${sentiment} vote for ${profileId}/${postId}`)
      let txid: string | void
      try {
        txid = await walletMessaging.sendMessage(
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
        try {
          // load the button element into jQuery
          const button = $(this)
          // update cached post data from API if the entry is expired
          //
          // since we just updated our vote count, tell updateCachedPost()
          // to save postMeta to localStorage
          const { votesPositive, votesNegative, ranking, postMeta } =
            await updateCachedPost(profileId, postId, true)
          // Update the button color and vote count on the appropriate button
          const span = button.find('span:last')
          switch (sentiment) {
            case 'positive': {
              if (postMeta?.hasWalletUpvoted) {
                button.attr('aria-label', 'Upvoted')
              }
              if (votesPositive > 0) {
                const minifiedVoteCount = toMinifiedNumber(votesPositive)
                if (span.html() !== minifiedVoteCount) {
                  span.html(minifiedVoteCount)
                }
              }
              break
            }
            case 'negative': {
              if (postMeta?.hasWalletDownvoted) {
                button.attr('aria-label', 'Downvoted')
              }
              if (votesNegative > 0) {
                const minifiedVoteCount = toMinifiedNumber(votesNegative)
                if (span.html() !== minifiedVoteCount) {
                  span.html(minifiedVoteCount)
                }
              }
              break
            }
            default: {
              // TOOD: add more cases if more sentiments are added in the future
            }
          }
          // handle post blurring
          const article = button.closest('article')
          if (article.length) {
            processPostBlurAction(
              article.parent().parent(),
              profileId,
              postId,
              ranking,
            )
          }
          // update all available avatar elements for this profile with appropriate reputation badge
          processAvatarElements(
            DOCUMENT_ROOT.find(
              `div[data-testid="UserAvatar-Container-${profileId}"]`,
            ),
          )
        } catch (e) {
          console.warn(e)
        }
      } catch (e) {
        console.warn(
          `failed to cast ${sentiment} vote for ${profileId}/${postId}`,
          e,
        )
      } finally {
        // enable button and allow this post to be auto-updated
        this.disabled = false
        STATE.delete('postIdBusy')
      }

      return false
    }
    /**
     *
     * @param element
     * @param mutationType
     * @returns
     */
    async function processMutatedElement(
      element: JQuery<HTMLElement>,
      mutationType: MutationType,
    ) {
      // don't process column/timeline elements or entire sections
      // helps to prevent unnecessary double processing
      if (element.is(`:has(${SELECTOR.Article.div.innerDiv})`)) {
        // set up array of selectors we still want to process
        const selectors: string[] = []
        // profile stats div (i.e. profile page)
        //selectors.push(SELECTOR.Article.div.profileStats)
        // primary column
        selectors.push(SELECTOR.Container.div.primaryColumn)
        // sidebar column
        selectors.push(SELECTOR.Container.div.sidebarColumn)
        // TODO: handle additional edge cases to avoid duplicate processing if necessary
        // join the selectors with a comma to find them all
        element = element.find(selectors.join(', '))
        //console.log('modified elements', element)
      }
      // get the mutator for either added or removed elements
      const mutator = mutators[mutationType]
      // process element as a post in a timeline (home, bookmarks, etc.)
      mutator.processPost(element)
      // process element for the Grok scroll list of buttons that we don't want
      mutator.processGrokElements(element)
      // process element for button elements of interest
      mutator.processButtons(element)
      // process element for an action button row (e.g. contains comment, repost, like buttons)
      mutator.processButtonRows(element)
      // process element for profiles avatars that contains the profileId in the data-testid attribute
      mutator.processAvatars(element)
      // process element for profile avatars in a conversation context (i.e. /messages URL)
      mutator.processAvatarConversation(element)
      // process element for profile stats (e.g. followers, following, etc.)
      // TODO: need to finish implementing this properly
      // needs to use the attributeFilter when navigating between profile pages
      //mutator.processProfileStats(element)
      /**
       *
       *  UNUSED HANDLERS BELOW
       *
       */
      // element is from notification timeline
      //mutator.processNotification(element)
      // element is a conversation in the messages timeline
      //mutator.processConversation(element)
      // element is a profile hover popup
      //mutator.processProfilePopup(element)
      /*
      // element is the primary column with profile data on page load
      if (element.has(SELECTOR.Container.div.primaryColumn).length == 1) {
        mutator.processPrimaryColumn(element)
      }
      */
    }
    /**
     *
     * @param element
     */
    function handleAttributeChange(target: HTMLElement) {
      const element = $(target)
      //console.log('handleAttributeChange', element)
      // set profile avatar badge
      // This is useful when navigating from one profile's page to another
      if (
        element.closest(SELECTOR.Article.div.profileAvatar).length &&
        element
          .attr('data-testid')
          ?.includes(SELECTOR.Article.value.profileAvatar)
      ) {
        //console.log('processing attribute change for avatar element', element)
        processAvatarElements(element)
      }
      // TODO: need to finish implementing this for profile ranking stats
      /*
      else if (
        element.closest(SELECTOR.Article.div.profileStats).length &&
        element.attr('href')?.includes(SELECTOR.Article.value.profileFollowers)
      ) {
        const profileId = element.attr('href')!.split('/')[1]
        console.log('followers element changed for', profileId)
      }
      */
    }
    /**
     *
     * @param mutation
     * @param mutationType
     * @returns
     */
    async function handldMutatedNode(
      mutation: HTMLElement,
      mutationType: MutationType,
    ) {
      const element = $(mutation)
      if (!element.prop('outerHTML')) {
        return
      }
      // immediately ignore some elements we don't care about
      else if (
        element.is('img') ||
        element.is('svg') ||
        // occurs when inserting vote buttons
        element.is('div:has(> button[data-sentiment])') ||
        element.is('button[data-sentiment]') ||
        element.is('div:has(> div[role="dialog"])') ||
        element.is('a') ||
        element.is('span') ||
        element.is(':header')
      ) {
        return
      }
      processMutatedElement(element, mutationType)
    }
    /**
     * Handle all mutations to the root node
     * @param mutations
     */
    function handleRootMutations(mutations: MutationRecord[]) {
      mutations.forEach(async mutation => {
        //const target = $(mutation.target as HTMLElement)
        switch (mutation.type) {
          case 'childList': {
            // process each removed node
            mutation.removedNodes.forEach(async mutation =>
              handldMutatedNode(mutation as HTMLElement, 'removed'),
            )
            // process each added node
            mutation.addedNodes.forEach(async mutation =>
              handldMutatedNode(mutation as HTMLElement, 'added'),
            )
            return
          }
          case 'attributes': {
            handleAttributeChange(mutation.target as HTMLElement)
            return
          }
        }
      })
    }
  },
})
