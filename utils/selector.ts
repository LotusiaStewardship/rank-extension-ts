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
        directMessage = 'conversation',
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
        grokProfileSummary = 'Profile Summary',
        roleLink = 'link',
      }
      export enum attr {
        innerDiv = `data-testid="${value.innerDiv}"`,
        notification = `data-testid="${value.notification}"`,
        tweet = `data-testid="${value.tweet}"`,
        directMessage = `data-testid="${value.directMessage}"`,
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
      export enum button {
        tweetLikeButton = `button[${attr.tweetLikeButton}]`,
        tweetUnlikeButton = `button[${attr.tweetUnlikeButton}]`,
        postUpvoteButton = `button[${attr.votePositiveButton}]`,
        postDownvoteButton = `button[${attr.voteNegativeButton}]`,
        // this button does not get loaded with post, but is added afterwards
        // so we cannot use the tweet selector as an ancesotor
        grokActions = `button[${attr.grokActions}]`,
      }
      export enum div {
        innerDiv = `div[${attr.innerDiv}]`,
        tweet = `article[${attr.tweet}]`,
        notification = `article[${attr.notification}]`,
        directMessage = `div[${attr.directMessage}]`,
        ad = `${tweet} div[dir="ltr"]:first-child span:contains("Ad")`,
        buttonRow = `div[role="group"]:has(${button.tweetLikeButton}, ${button.tweetUnlikeButton})`,
        tweetText = `${tweet} div[${attr.tweetText}]`,
        tweetUserName = `${tweet} div[${attr.tweetUserName}]`,
        profileAvatar = `div[${attr.profileAvatar}]`,
        profileAvatarUnknown = `div[${attr.profileAvatarUnknown}]`,
        profileAvatarConversation = `${div.profileAvatarUnknown}, a[${attr.conversationAvatar}]`,
        profilePopup = `div[${attr.profilePopup}]:has(${div.profileAvatar})`,
        quoteTweet = `${tweet} div[${attr.roleLink}][tabindex]:has(div[${attr.profileAvatar}])`,
        quoteTweetUserName = `${div.quoteTweet} div[${attr.tweetUserName}]`,
        quoteTweetProfileAvatar = `${div.quoteTweet} div[${attr.profileAvatar}]`,
      }
      export enum a {
        tweetId = `${div.tweet} a[${attr.tweetId}]`,
        retweetUserName = `${div.tweet} a[role="link"][dir="ltr"], ${div.notification} a[role="link"][dir="ltr"]`,
        tweetUserName = `${div.tweet} a[role="link"]:not([dir="ltr"]), ${div.notification} a[role="link"]:not([dir="ltr"])`,
        avatarConversation = `a[${attr.conversationAvatar}], a:has(:not([href*="/follow"]))`,
      }
      export enum span {
        quoteTweetUserName = `${div.quoteTweet} div[${attr.tweetUserName}]`,
        grokProfileSummary = `span:contains("${value.grokProfileSummary}")`,
      }
    }
  }
}
