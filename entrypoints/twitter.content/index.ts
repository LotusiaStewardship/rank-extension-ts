import { MatchPattern } from 'wxt/sandbox'
import { Parser } from '@/utils/parser'
import { Selector } from '@/utils/selector'
import { walletMessaging } from '@/entrypoints/background/messaging'
import { CheerioAPI, load } from 'cheerio'
import { PLATFORMS, PlatformParameters } from 'rank-lib'
import { DEFAULT_RANK_THRESHOLD, DEFAULT_RANK_API } from '@/utils/constants'
import { ROOT_URL, VOTE_POSITIVE_ARROW_SVG, VOTE_NEGATIVE_ARROW_SVG } from './constants'
import './style.css'
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
/** */
type CachedPostMap = Map<string, CachedPostElement> // string is postId
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
  postId: string
}
type RankAPIResult = IndexedRanking | IndexedPostRanking
const defaultRanking: Partial<RankAPIResult> = {
  ranking: '0',
  votesPositive: 0,
  votesNegative: 0,
}
type RankAPIErrorResult = {
  error: string
  params: Partial<IndexedRanking>
}
const cache: CachedPostMap = new Map()
/**
 * Process post element and return data to fetch ranking from RANK API
 * @param $ `HTMLElement` loaded into `CheerioAPI`
 * @returns {ProcessedPostElement}
 */
const processPostElement = ($: CheerioAPI): ProcessedPostElement => {
  const t0 = performance.now()
  // Select elements
  const adDiv = $(Selector.Twitter.Article.div.ad)
  const tweetTextDiv = $(Selector.Twitter.Article.div.tweetText)
  const tweetUserNameLink = $(Selector.Twitter.Article.a.tweetUserName)
  const retweetUserNameLink = $(Selector.Twitter.Article.a.retweetUserName)
  const postIdLink = $(Selector.Twitter.Article.a.tweetId)
  // Parse elements for text data
  const postText = Parser.Twitter.Article.postTextFromElement(tweetTextDiv)
  const profileId = Parser.Twitter.Article.profileIdFromElement(tweetUserNameLink)
  const retweetProfileId =
    Parser.Twitter.Article.profileIdFromElement(retweetUserNameLink)
  const postId = Parser.Twitter.Article.postIdFromElement(postIdLink)
  const t1 = (performance.now() - t0).toFixed(3)
  console.log(`processed post from ${profileId} in ${t1}ms`)

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
  upvoteButton.setAttribute('data-testid', 'vote-positive')
  upvoteButton.setAttribute('data-postid', data.postId)
  upvoteButton.setAttribute('data-profileid', data.profileId)
  upvoteButton.setAttribute('aria-label', '0 upvotes. Upvote')
  upvoteButton.addEventListener('click', handlePostVoteButtonClick)
  const upvoteSvg = upvoteButton.querySelector('svg')!
  upvoteSvg.outerHTML = VOTE_POSITIVE_ARROW_SVG
  upvoteButtonContainer.appendChild(upvoteButton)
  // Create downvote button and its container
  const downvoteButtonContainer = origButton.parentElement!.cloneNode() as Element
  const downvoteButton = origButton.cloneNode(true) as HTMLButtonElement
  updatePostVoteButtonVoteCount(upvoteButton, 0)
  downvoteButton.setAttribute('data-testid', 'vote-negative')
  downvoteButton.setAttribute('data-postid', data.postId)
  downvoteButton.setAttribute('data-profileid', data.profileId)
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
  postId: string,
): [HTMLButtonElement, HTMLButtonElement] => [
  element.querySelector(
    `${Selector.Twitter.Article.button.postUpvoteButton}[data-postid="${postId}"]`,
  ) as HTMLButtonElement,
  element.querySelector(
    `${Selector.Twitter.Article.button.postDownvoteButton}[data-postid="${postId}"]`,
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
const updatePostVoteButtonVoteCount = (button: HTMLButtonElement, count: number) => {
  const span = getPostVoteButtonCountElement(button)
  span.innerHTML = String(count)
}
/**
 *
 * @param this
 * @param ev
 */
async function handlePostVoteButtonClick(this: HTMLButtonElement, ev: MouseEvent) {
  const postId = this.getAttribute('data-postid')!
  const profileId = this.getAttribute('data-profileid')!
  const voteType = this.getAttribute('data-testid')!
  const sentiment = voteType == 'vote-positive' ? 'positive' : 'negative'
  console.log(`casting ${sentiment} vote for ${profileId}/${postId}`)
  const txid = await walletMessaging.sendMessage('content-script:submitRankVote', {
    platform: 'twitter',
    profileId,
    sentiment,
    postId,
  })
  if (txid) {
    console.log(`successfully cast ${sentiment} vote for ${profileId}/${postId}`, txid)
    const { ranking, votesPositive, votesNegative } = (await fetchRankApiData(
      profileId,
      postId,
    )) as RankAPIResult
    updatePostVoteButtonVoteCount(
      this,
      voteType == 'vote-positive' ? votesPositive : votesNegative,
    )
    const cachedPost = cache.get(postId)!
    cachedPost.ranking = BigInt(ranking)
    if (cachedPost.ranking < DEFAULT_RANK_THRESHOLD) {
      hidePost(postId)
    }
  }
}
/**
 *
 * @param postId
 */
const hidePost = (postId: string) => {
  cache.get(postId)?.element.classList.add('hidden')
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
 * @param postId
 * @returns
 */
const isPostBelowThreshold = ({
  postId,
  voteButtons,
}: {
  postId: string
  voteButtons?: [HTMLButtonElement, HTMLButtonElement]
}): boolean => {
  voteButtons ||= getPostVoteButtons(
    document.querySelector(Selector.Twitter.Container.div.timeline) as HTMLElement,
    postId,
  )
  const [upvoteButton, downvoteButton] = voteButtons
  const upvoteCount = Number(getPostVoteButtonCountElement(upvoteButton).innerHTML)
  const downvoteCount = Number(getPostVoteButtonCountElement(downvoteButton).innerHTML)
  return downvoteCount > upvoteCount
}
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
      attributes: false,
      characterData: false,
    })
  }
  private validateMutatedElement = (element: HTMLElement) => {
    const $ = load(element.outerHTML)
    let elementType: 'post' | 'notification' | null = null
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
      switch (elementType) {
        case 'post':
          // Get the postId and delete the post from the cache
          const { postId } = processPostElement($)
          cache.delete(postId)
          break
        case 'notification':
          // may not even need to do anything with this
          break
      }
    }
  }
  private handleAddedNodes = async (nodes: NodeList) => {
    for (const node of nodes) {
      const element = node as HTMLElement
      // make sure the element is parseable
      if (!element.outerHTML) {
        continue
      }
      const { $, elementType } = this.validateMutatedElement(element)
      // Process the element depending on the determined type
      switch (elementType) {
        case 'post':
          const { isAd, profileId, retweetProfileId, postId } = processPostElement($)
          // Always hide ads :)
          if (isAd) {
            console.log(`hiding post with ID ${postId} from profile ${profileId} (Ad)`)
            element.classList.add('hidden')
            continue
          }
          // Mutate post element to add RANK vote buttons
          const [upvoteButton, downvoteButton] = addPostVoteButtons(element, {
            profileId,
            postId,
          } as ProcessedPostElement)
          // Fetch indexed post ranking from RANK API
          const { ranking, votesPositive, votesNegative } = (await fetchRankApiData(
            profileId,
            postId,
          )) as IndexedPostRanking
          // Update vote counts for the upvote/downvote buttons
          updatePostVoteButtonVoteCount(upvoteButton, votesPositive)
          updatePostVoteButtonVoteCount(downvoteButton, votesNegative)
          // Hide the post if below ranking
          const rankingBigInt = BigInt(ranking)
          if (rankingBigInt < DEFAULT_RANK_THRESHOLD) {
            console.log(
              `hiding post with ID ${postId} from profile ${profileId} (post below rank threshold)`,
            )
            element.classList.add('hidden')
          }
          // add this post to the cache
          cache.set(postId, {
            element,
            ranking: rankingBigInt,
            votesPositive,
            votesNegative,
          })
          break
        case 'notification':
          // process these elements specifically for profileId ranking
          break
      }
    }
  }
  /** Handle all mutations to the root node */
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
  matches: ['*://*.x.com/*', '*://x.com/*', '*://pro.x.com/*'],
  world: 'ISOLATED',
  // https://developer.chrome.com/docs/extensions/reference/api/extensionTypes#type-RunAt
  runAt: 'document_start',
  async main(ctx) {
    // Start observing Twitter's `react-node` for mutations
    new Mutator().startMutationObserver()
  },
})
