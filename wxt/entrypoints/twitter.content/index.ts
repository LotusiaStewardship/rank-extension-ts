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
/** https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver */
const observers: Map<'react-root', MutationObserver> = new Map()
/** https://wxt.dev/guide/essentials/content-scripts.html#dealing-with-spas */
const urlPatterns: Map<
  'home' | 'notifications' | 'timeline' | 'post' | 'bookmarks',
  MatchPattern
> = new Map()
urlPatterns.set('home', new MatchPattern(`${ROOT_URL}/home`))
urlPatterns.set('notifications', new MatchPattern(`${ROOT_URL}/notifications`))
urlPatterns.set('timeline', new MatchPattern(`${ROOT_URL}/*`))
urlPatterns.set('post', new MatchPattern(`${ROOT_URL}/*/status/*`))
urlPatterns.set('bookmarks', new MatchPattern(`${ROOT_URL}/*/bookmarks`))
/** Hide the provided `postId` from view */
const hideTimelinePost = async (postId: string) => {
  const domElement = document.body.querySelector(
    `${Selector.TwitterArticle.div.tweet}:has(a[href*="/status/${postId}"])`,
  )
  domElement?.classList.add('lotus-rank-below-threshold')
}
/** Observe mutations to the root node */
const rootObserve = () => {
  // Query the root container for observation
  const root = document.body.querySelector(Selector.TwitterContainer.div.root)
  // Set up root container observer instance
  observers.set('react-root', new MutationObserver(handleRootMutations))
  // Begin observing root node to find the timeline node
  console.log('connecting react-root observer')
  observers.get('react-root')?.observe(root as Node, {
    childList: true,
    subtree: true,
  })
}
/** Handle all mutations to the root node */
const handleRootMutations = (mutations: MutationRecord[]) => {
  const timeline = document.body.querySelector(Selector.TwitterContainer.div.timeline)
  // only process mutations if a timeline is available
  if (timeline) {
    mutations.forEach(async mutation => {
      for (const node of mutation.addedNodes) {
        const $ = load((node as HTMLElement).outerHTML)
        // only process elements with a single tweet; avoids duplicate processing
        if ($(Selector.TwitterArticle.div.tweet).length == 1) {
          // HTML is already loaded so pass the `CheerioAPI` instance
          processTweet($)
        }
      }
    })
  }
}
/** Parse the provided `CheerioAPI` element for tweet data and process accordingly */
const processTweet = async ($: CheerioAPI) => {
  const t0 = performance.now()
  // Select elements
  const tweetTextDiv = $(Selector.TwitterArticle.div.tweetText)
  const tweetUserNameLink = $(Selector.TwitterArticle.a.tweetUserName)
  const postIdLink = $(Selector.TwitterArticle.a.tweetId)
  // Parse elements for text data
  const postText = Parser.TwitterArticle.postTextFromElement(tweetTextDiv)
  const userName = Parser.TwitterArticle.userNameFromElement(tweetUserNameLink)
  const postId = Parser.TwitterArticle.postIdFromElement(postIdLink)
  const t1 = (performance.now() - t0).toFixed(3)
  if (postId) {
    console.log(`parsed ${postId} from profile ${userName} in ${t1}ms`)
  }
  // remove ads :)
  if ($(Selector.TwitterArticle.div.ad).length == 1) {
    console.log(`hiding post ID ${postId} from profile ${userName} (Ad)`)
    hideTimelinePost(postId as string)
    return
  }
  // fetch profile data from RANK API
  // If no data, continue to next tweet
  if (userName) {
    try {
      const profile = await fetch(`${DEFAULT_RANK_API}/twitter/${userName}`)
      const parsed = await profile.json() as Profile
      const ranking = BigInt(parsed.ranking)
      // hide the post if the profile is below rank threshold
      if (ranking < DEFAULT_RANK_THRESHOLD) {
        console.log(
          `hiding post ID ${postId} from profile ${userName} (profile below rank threshold)`,
        )
        hideTimelinePost(postId as string)
        return
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
      const post = await fetch(`${DEFAULT_RANK_API}/twitter/${userName}/${postId}`)
      const parsed = await post.json() as Post
      const ranking = BigInt(parsed.ranking)
      if (ranking < DEFAULT_RANK_THRESHOLD) {
        console.log(`hiding post ID ${postId} from profile ${userName} (post below rank threshold)`)
        hideTimelinePost(postId as string)
        return
      }
    } catch (e) {
      // ignore; postId is not indexed (i.e. neutral ranking)
      return
    }
  }

  /**
   * TODO: Use some form of storage to minimize required API calls for recently fetched Profile/Post
   * Use a short timeout (10s? 15s? 30s?) so that we are always displaying recent data
  // fetch post from storage if available
  let storedPost: Post
  try {
    const post = await storage.getItem(`local:${userName}::${postId}`)
    console.assert(post, `post ID not found in storage ${postId}`)
    storedPost = post as Post
  } catch (e) {
    // add post if not found in local cache
    await storage.setItem(`local:${userName}::${postId}`, posts[0])
    storedPost = posts[0]
  } 
  */
}

export default defineContentScript({
  matches: ['*://*.x.com/*', '*://x.com/*'],
  // https://developer.chrome.com/docs/extensions/reference/api/extensionTypes#type-RunAt
  runAt: 'document_start',
  async main(ctx) {
    // Start observing Twitter's `react-node` for mutations
    rootObserve()
  },
})
