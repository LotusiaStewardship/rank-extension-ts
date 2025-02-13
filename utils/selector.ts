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
      export enum value {
        innerDiv = 'cellInnerDiv',
        notification = 'notification',
        tweet = 'tweet',
        tweetComplete = 'tweet-text-show-more-link',
        tweetText = 'tweetText',
        tweetUserName = 'User-Name',
        profilePopup = 'HoverCard',
        conversationAvatar = 'DM_Conversation_Avatar',
        profileAvatar = 'UserAvatar-Container',
        profileAvatarUnknown = 'UserAvatar-Container-unknown',
        profileUserName = 'UserName',
        tweetId = '/status/',
        tweetLikeButton = 'like',
        tweetUserAvatar = 'Tweet-User-Avatar',
        tweetUnlikeButton = 'unlike',
        votePositiveButton = 'upvote',
        voteNegativeButton = 'downvote',
        grokActions = 'Grok actions',
        roleLink = 'link',
      }
      export enum attr {
        innerDiv = `data-testid="${value.innerDiv}"`,
        notification = `data-testid="${value.notification}"`,
        tweet = `data-testid="${value.tweet}"`,
        tweetComplete = `data-testid="${value.tweetComplete}"`,
        tweetText = `data-testid="${value.tweetText}"`,
        tweetUserName = `data-testid="${value.tweetUserName}"`,
        profilePopup = `data-testid="${value.profilePopup}"`,
        conversationAvatar = `data-testid="${value.conversationAvatar}"`,
        profileAvatar = `data-testid^="${value.profileAvatar}"`,
        profileAvatarUnknown = `data-testid="${value.profileAvatarUnknown}"`,
        profileUserName = `data-testid="${value.profileUserName}"`,
        tweetId = `href*="${value.tweetId}"`,
        tweetLikeButton = `data-testid="${value.tweetLikeButton}"`,
        tweetUnlikeButton = `data-testid="${value.tweetUnlikeButton}"`,
        tweetUserAvatar = `data-testid="${value.tweetUserAvatar}"`,
        votePositiveButton = `data-testid="${value.votePositiveButton}"`,
        voteNegativeButton = `data-testid="${value.voteNegativeButton}"`,
        grokActions = `aria-label="${value.grokActions}"`,
        roleLink = `role="${value.roleLink}"`,
      }
      export enum div {
        innerDiv = `div[${attr.innerDiv}]`,
        tweet = `div[${attr.innerDiv}]:has(article[${attr.tweet}])`,
        directMessage = `div[${attr.innerDiv}]:has(div[data-testid="conversation"])`,
        notification = `div[${attr.innerDiv}]:has(article[${attr.notification}])`,
        ad = `${div.tweet} div[dir="ltr"]:first-child span:contains("Ad")`,
        tweetText = `${div.tweet} div[${attr.tweetText}]`,
        tweetUserName = `${div.tweet} div[${attr.tweetUserName}]`,
        profileAvatar = `div[${attr.profileAvatar}]`,
        profileAvatarUnknown = `div:has(div[${attr.profileAvatarUnknown}], a[${attr.conversationAvatar}])`,
        profilePopup = `div[${attr.profilePopup}]:has(${div.profileAvatar})`,
        quoteTweet = `${div.tweet} div[${attr.roleLink}][tabindex]:has(div[${attr.profileAvatar}])`,
        quoteTweetUserName = `${div.quoteTweet} div[${attr.tweetUserName}]`,
        quoteTweetProfileAvatar = `${div.quoteTweet} div[${attr.profileAvatar}]`,
      }
      export enum a {
        tweetId = `${div.tweet} a[${attr.tweetId}]`,
        retweetUserName = `${div.tweet} a[role="link"][dir="ltr"], ${div.notification} a[role="link"][dir="ltr"]`,
        tweetUserName = `${div.tweet} a[role="link"]:not([dir="ltr"]), ${div.notification} a[role="link"]:not([dir="ltr"])`,
        avatarLink = `a:first-child, a[${attr.conversationAvatar}]`,
      }
      export enum button {
        tweetLikeButton = `${div.tweet} button[${attr.tweetLikeButton}]`,
        tweetUnlikeButton = `${div.tweet} button[${attr.tweetUnlikeButton}]`,
        postUpvoteButton = `${div.tweet} button[${attr.votePositiveButton}]`,
        postDownvoteButton = `${div.tweet} button[${attr.voteNegativeButton}]`,
        // this button does not get loaded with post, but is added afterwards
        // so we cannot use the div.tweet selector as an ancesotor
        grokActions = `button[${attr.grokActions}]`,
      }
      /*
      export enum img {
        profileAvatar = `${div.profileAvatar}:has(img[alt])`,
      }
      */
      export enum span {
        quoteTweetUserName = `${div.quoteTweet} div[${attr.tweetUserName}]`,
      }
    }
  }
}
