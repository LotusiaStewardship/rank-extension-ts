/** jQuery selector definitions */
export namespace Selector {
  /** Twitter containers are where we find TwitterArticle elements */
  export namespace TwitterContainer {
    export enum attr {
      timeline = 'aria-label="Timeline: Your Home Timeline"',
      conversation = 'aria-label="Timeline: Conversation"',
    }
    export enum div {
      timeline = `div[${attr.timeline}]`,
      conversation = `div[${attr.conversation}]`,
    }
  }
  /** Selectors for Tweet DOM elements */
  export namespace TwitterArticle {
    export enum attr {
      innerDiv = 'data-testid="cellInnerDiv"',
      tweetComplete = 'data-testid="tweet-text-show-more-link"',
      tweetText = 'data-testid="tweetText"',
      tweetUserName = 'data-testid="User-Name"',
      tweetId = 'href*="/status/"',
    }
    export enum div {
      tweet = `div[${attr.innerDiv}]:has(article)`,
      tweetText = `div[${attr.tweetText}]`,
      tweetUserName = `div[${attr.tweetUserName}]`,
    }
    export enum a {
      tweetId = `a[${attr.tweetId}]`,
      tweetUserName = `a[role="link"]`,
    }
  }
}
