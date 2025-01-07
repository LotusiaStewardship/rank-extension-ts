import { MatchPattern } from 'wxt/sandbox'
import { Parser } from '@/utils/parser'
import { Selector } from '@/utils/selector'
import { CheerioAPI, load } from 'cheerio'
import { DEFAULT_RANK_THRESHOLD, DEFAULT_RANK_API } from '@/utils/constants'
import { ROOT_URL } from './constants'
import './style.css'
/** Profile object returned from RANK backend API */
type Profile = {
  platform: string
  profileId: string
  ranking: string
  votesPositive: number
  votesNegative: number
}
/** Post object returned from RANK backend API */
type Post = Profile & {
  postId: string
}
/** Observe the configured root node of the document and enforce profile/post rankings in the DOM */
class DOM {
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
  /** Handle all mutations to the root node */
  private handleRootMutations = (mutations: MutationRecord[]) => {
    mutations.forEach(async mutation => {
      for (const node of mutation.addedNodes) {
        const element = node as Element
        const $ = load(element.outerHTML)
        let elementType: 'post' | 'notification' | null = null
        // element is from tweet timeline (home, bookmarks, etc.)
        if ($(Selector.Twitter.Article.div.tweet).length == 1) {
          elementType = 'post'
        }
        // element is from notification timeline
        else if ($(Selector.Twitter.Article.div.notification).length == 1) {
          elementType = 'notification'
        }
        if (elementType) {
          const isBelowThreshold = await this.isBelowThreshold($, elementType)
          if (isBelowThreshold) {
            element.classList.add('lotus-rank-below-threshold')
          }
        }
      }
    })
  }
  /** Parse the provided `CheerioAPI` as a post check if ranking is below threshold */
  private isBelowThreshold = async (
    $: CheerioAPI,
    elementType: 'post' | 'notification',
  ) => {
    const t0 = performance.now()
    // Select elements
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
    console.log(`processed ${elementType} from ${profileId} in ${t1}ms`)
    // remove ads :)
    if ($(Selector.Twitter.Article.div.ad).length == 1) {
      console.log(
        `hiding ${elementType} with ID ${postId} from profile ${profileId} (Ad)`,
      )
      return true
    }
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
    if (profileId) {
      try {
        const profile = await fetch(`${DEFAULT_RANK_API}/twitter/${profileId}`)
        const parsed = (await profile.json()) as Profile
        const ranking = BigInt(parsed.ranking)
        // hide the post if the profile is below rank threshold
        // TODO: use user's threshold settings
        if (ranking < DEFAULT_RANK_THRESHOLD) {
          console.log(
            `hiding ${elementType} with ID ${postId} from profile ${profileId} (profile below rank threshold)`,
          )
          return true
        }
      } catch (e) {
        // if no username, return here
        // no postId will be indexed if the profileId is also not indexed
        return
      }
    }
    // fetch tweet data from RANK API
    // If no data, continue to next tweet
    if (postId) {
      try {
        const post = await fetch(`${DEFAULT_RANK_API}/twitter/${profileId}/${postId}`)
        const parsed = (await post.json()) as Post
        const ranking = BigInt(parsed.ranking)
        // TODO: use user's threshold settings
        if (ranking < DEFAULT_RANK_THRESHOLD) {
          console.log(
            `hiding ${elementType} with ID ${postId} from profile ${profileId} (post below rank threshold)`,
          )
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
  matches: ['*://*.x.com/*', '*://x.com/*'],
  world: 'ISOLATED',
  // https://developer.chrome.com/docs/extensions/reference/api/extensionTypes#type-RunAt
  runAt: 'document_idle',
  async main(ctx) {
    // Start observing Twitter's `react-node` for mutations
    const dom = new DOM()
    dom.startMutationObserver()
  },
})
