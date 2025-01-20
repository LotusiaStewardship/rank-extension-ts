/** jQuery selector definitions */
export namespace Selector {
  /** All selectors for the Twitter platform */
  export namespace Twitter {
    /** Twitter containers are where we find TwitterArticle elements */
    export namespace Container {
      export enum attr {
        timeline = 'aria-label*="timeline"',
        root = `react-root`,
      }
      export enum div {
        timeline = `div[${attr.timeline}]`,
        root = `div#${attr.root}`,
      }
    }
    /** Selectors for Tweet DOM elements */
    export namespace Article {
      export enum attr {
        innerDiv = 'data-testid="cellInnerDiv"',
        notification = 'data-testid="notification"',
        tweet = 'data-testid="tweet"',
        tweetComplete = 'data-testid="tweet-text-show-more-link"',
        tweetText = 'data-testid="tweetText"',
        tweetUserName = 'data-testid="User-Name"',
        tweetId = 'href*="/status/"',
        tweetLikeButton = 'data-testid="like"',
        tweetUnlikeButton = 'data-testid="unlike"',
        votePositiveButton = 'data-testid="vote-positive"',
        voteNegativeButton = 'data-testid="vote-negative"',
      }
      export enum div {
        innerDiv = `div[${attr.innerDiv}]`,
        tweet = `div[${attr.innerDiv}]:has(article[${attr.tweet}])`,
        notification = `div[${attr.innerDiv}]:has(article[${attr.notification}])`,
        ad = `${div.tweet} div[dir="ltr"]:first-child span:contains("Ad")`,
        tweetText = `${div.tweet} div[${attr.tweetText}]`,
        tweetUserName = `${div.tweet} div[${attr.tweetUserName}]`,
      }
      export enum a {
        tweetId = `${div.tweet} a[${attr.tweetId}]`,
        retweetUserName = `${div.tweet} a[role="link"][dir="ltr"], ${div.notification} a[role="link"][dir="ltr"]`,
        tweetUserName = `${div.tweet} a[role="link"]:not([dir="ltr"]), ${div.notification} a[role="link"]:not([dir="ltr"])`,
      }
      export enum button {
        tweetLikeButton = `${div.tweet} button[${attr.tweetLikeButton}]`,
        tweetUnlikeButton = `${div.tweet} button[${attr.tweetUnlikeButton}]`,
        postUpvoteButton = `${div.tweet} button[${attr.votePositiveButton}]`,
        postDownvoteButton = `${div.tweet} button[${attr.voteNegativeButton}]`,
      }
    }
  }
}
