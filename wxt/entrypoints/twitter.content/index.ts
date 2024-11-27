import { Parser } from "@/utils/parser";
import { Selector } from "@/utils/selector";
import assert from "assert";
import { load } from "cheerio";

const posts = [
  {"platform":"twitter","profileId":"seanballard","postId":"1802810866061988228","ranking":"-62669000000","votesPositive":0,"votesNegative":62669}
]

export default defineContentScript({
  matches: ['*://*.x.com/*', '*://x.com/*'],
  runAt: 'document_end', // https://developer.chrome.com/docs/extensions/reference/api/extensionTypes#type-RunAt
  async main() {
    // 
    const timelineObserver = new MutationObserver(timelineObserve)
    const root = document.body.querySelector(Selector.TwitterContainer.div.root)
    const rootObserver = new MutationObserver(() => {
      // Query the timeline div
      const timeline = document.body.querySelector(
        Selector.TwitterContainer.div.timeline
      )
      // Disconnect root observer and set up timeline observer if found
      if (timeline) {
        timelineObserver.observe(timeline, {
          childList: true, subtree: true
        })
        rootObserver.disconnect()
      }
    })
    // Begin observing root node for DOM updates (mutations)
    rootObserver.observe(root as Node, {
      childList: true,
      subtree: true,
      attributes: true
    })

    try {
      const profile = await fetch('https://rank.lotusia.org/api/v1/twitter/owenbenjamin')
      const json = await profile.json()
      console.log(json)
    } catch (e) {
      console.log(`fuck ${e}`)
    }
  },
});

const rootObserve = (mutations: MutationRecord[]) => {
  if (mutations.length > 0) {
    mutations.forEach(mutation => {
      console.log(`mutation ${mutation.target.textContent}`)
    })
    //const $ = load(html)
    //const timeline = $(Selector.TwitterContainer.div.timeline)
    //const $ = load(document.body.innerHTML)
    //const timeline = $(Selector.TwitterContainer.div.timeline)
    //console.log(`timeline ${timeline}`)
    //if (timeline) {
    //  //processTimeline(timeline)
    //  // Start timeline observer
    //  //timelineObserver.observe(timeline, {
    //  //  childList: true, subtree: true
    //  //})
    //  // Stop redundant root observer
    //  //rootObserver.disconnect()
    //  // Process timeline
    //  //processTimeline(timeline)
    //}
  }
}

const datestr = () => new Date().toISOString()
function timelineObserve(mutations: MutationRecord[]) {
  console.log(`timeline observed`)
  mutations.forEach(mutation => {
    const target = mutation.target as HTMLElement
    const $ = load(target.outerHTML)
    
    const tweets = $(Selector.TwitterArticle.div.tweet)
    console.log(`tweets ${tweets.length}`)
    if (tweets.length > 0) {
      for (const tweet of tweets) {
        console.log(tweet)
        const t_s0 = performance.now()
        try {
          // Select elements
          const tweetTextDiv = $(Selector.TwitterArticle.div.tweetText, tweet)
          const tweetUserNameLink = $(Selector.TwitterArticle.a.tweetUserName, tweet)
          const postIdLink = $(Selector.TwitterArticle.a.tweetId, tweet)
          // Parse elements for text data
          const postText = Parser.TwitterArticle.postTextFromElement(tweetTextDiv)
          const userName = Parser.TwitterArticle.userNameFromElement(tweetUserNameLink)
          const postId = Parser.TwitterArticle.postIdFromElement(postIdLink)
          // Verify text data
          assert(postText, 'tweet text not found')
          assert(userName, 'username not found')
          assert(postId, 'post ID not found')
          // fetch post from storage if available
          storage.getItem(`local:${userName}::${postId}`)

          const t_s1 = (performance.now() - t_s0).toFixed(3)
          console.log(`${datestr()}: ${userName}: ${postId}: ${postText} (${t_s1}ms)`)
        } catch (e) {

        }
      }
    }
  })
  //const timeline = document.querySelector(Selector.TwitterContainer.div.timeline)
  //if (timeline) {
  //  processTimeline(timeline)
  //}
}
