import { Parser } from '@/utils/parser'
import { Selector } from '@/utils/selector'
import { load } from 'cheerio'
import { RANK_API } from '@/utils/constants'
import './style.css'

type Post = {
  platform: string;
  profileId: string;
  postId: string;
  ranking: bigint;
  votesPositive: number;
  votesNegative: number;
}
const posts: Post[] = [
  {
    platform: 'twitter',
    profileId: 'seanballard',
    postId: '1585519088238993410',
    ranking: -62669000000n,
    votesPositive: 0,
    votesNegative: 62669,
  },
]
const observers: Map<'root' | 'timeline', MutationObserver> = new Map()


export default defineContentScript({
  matches: ['*://*.x.com/*', '*://x.com/*'],
  // https://developer.chrome.com/docs/extensions/reference/api/extensionTypes#type-RunAt
  world: 'ISOLATED',
  runAt: 'document_end',
  async main() {
    // Query the root container for observation
    const root = document.body.querySelector(Selector.TwitterContainer.div.root)
    // Set up root container observer and callback
    observers.set('root', new MutationObserver(() => {
      // Query the timeline div
      const timeline = document.body.querySelector(Selector.TwitterContainer.div.timeline)
      // Disconnect root observer and set up timeline observer if found
      if (timeline) {
        observers.get('timeline')?.observe(timeline, {
          childList: true,
          subtree: true,
        })
        observers.get('root')?.disconnect()
        observers.delete('root')
      }
    }))
    // Instantiate timeline observer
    observers.set('timeline', new MutationObserver(timelineObserve))
    // Begin observing root node for DOM updates (mutations)
    observers.get('root')?.observe(root as Node, {
      childList: true,
      subtree: true,
      attributes: true,
    })
  },
})

const datestr = () => new Date().toISOString()
const timelineObserve = (mutations: MutationRecord[]) => {
  console.log(`timeline observed`)
  mutations.forEach(async mutation => {
    for (const node of mutation.addedNodes) {
      console.log(node)
      //console.log(`added node ${(node as HTMLElement).outerHTML}`)
      const added = node as HTMLElement
      const $ = load(added.outerHTML)
      const tweet = $(Selector.TwitterArticle.div.tweet)
      // only process elements with a single tweet; avoids duplicate processing
      if (tweet.length == 1) {
        const t_s0 = performance.now()
        const $ = load(tweet.html() as string)
        // Select elements
        const tweetTextDiv = $(Selector.TwitterArticle.div.tweetText)
        const tweetUserNameLink = $(Selector.TwitterArticle.a.tweetUserName)
        const postIdLink = $(Selector.TwitterArticle.a.tweetId)
        // Parse elements for text data
        const postText = Parser.TwitterArticle.postTextFromElement(tweetTextDiv)
        const userName = Parser.TwitterArticle.userNameFromElement(tweetUserNameLink)
        const postId = Parser.TwitterArticle.postIdFromElement(postIdLink)
        // Verify parsed DOM data
        try {
          console.assert(postText, 'tweet text not found')
          console.assert(userName, 'username not found')
          console.assert(postId, 'post ID not found')
      
          const t_s1 = (performance.now() - t_s0).toFixed(3)
          console.log(`${datestr()}: ${userName}: ${postId}: ${postText} (${t_s1}ms)`)
        } catch (e) {
          // issue parsing for required data; continue to next tweet
          //console.log(e, html)
          continue
        }
        // fetch tweet data from RANK API
        try {
          const profile = await fetch(
            `${RANK_API}/twitter/${userName}/status/${postId}`,
            {
              mode: 'no-cors'
            }
          )
          const json = await profile.json()
          console.log(json)
        } catch (e) {
          // ignore; likely API does not have post indexed
        }
      
        /**
         * Won't need this
         * We are now correctly processing new HTML nodes one at a time
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
      
        // apply ranking
        if (posts[0].postId == postId) {
          if (posts[0].ranking < 0n) {
            console.log(`hiding tweet ID ${postId}`)
            hidePost(postId)
          }
        }
      }
    }
  })
}

const hidePost = async (postId: string) => {
  const selector = `${Selector.TwitterArticle.div.tweet}:has(a[href*="/status/${postId}"])`
  const domElement = document.body.querySelector(selector)
  domElement?.classList.add('hidden-downranked')
  console.log(document.body.querySelector(selector))
}