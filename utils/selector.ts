/** jQuery selector definitions */
export namespace Selector {
  /** All selectors for the Twitter platform */
  export namespace Twitter {
    /** Twitter containers are where we find TwitterArticle elements */
    export namespace Container {
      export enum attr {
        timeline = 'aria-label*="timeline"',
        root = `react-root`,
        primaryColumn = `data-testid="primaryColumn"`,
      }
      export enum div {
        timeline = `div[${attr.timeline}], div[aria-label*="Timeline"]`,
        root = `div#${attr.root}`,
        primaryColumn = `div[${attr.primaryColumn}]`,
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
        profileFollowing = '/following',
        profileFollowers = '/verified_followers',
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
        scrollSnapList = 'ScrollSnap-List',
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
        profileFollowing = `href$="${value.profileFollowing}"`,
        profileFollowers = `href$="${value.profileFollowers}"`,
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
        grokProfileSummary = `aria-label="${value.grokProfileSummary}"`,
        grokScrollList = `data-testid="${value.scrollSnapList}"`,
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
        grokProfileSummary = `button[${attr.grokProfileSummary}], button:has(span:contains("${value.grokProfileSummary}"))`,
      }
      export enum div {
        innerDiv = `div[${attr.innerDiv}]`,
        tweet = `article[${attr.tweet}]`,
        quoteTweet = `${tweet} div[${attr.roleLink}][tabindex]:has(div[${attr.profileAvatar}])`,
        notification = `article[${attr.notification}]`,
        directMessage = `div[${attr.directMessage}]`,
        ad = `${tweet} div[dir="ltr"]:has(span:contains("Ad")) ~ div:has(button[data-testid="caret"])`,
        //ad = `${tweet} div:not([${attr.tweetUserName}]) div[dir="ltr"]:has(span:contains("Ad")) + div:has(button)`,
        buttonRow = `div[role="group"]:has(${button.tweetLikeButton}, ${button.tweetUnlikeButton}):only-of-type`,
        grokScrollList = `div[data-testid*="followups"] + nav:has(div[${attr.grokScrollList}])`,
        tweetText = `${tweet} div[${attr.tweetText}]`,
        tweetUserName = `${tweet} div[${attr.tweetUserName}]`,
        profileAvatar = `div[${attr.profileAvatar}]:not([${attr.profileAvatarUnknown}])`,
        profileAvatarUnknown = `div[${attr.profileAvatarUnknown}]`,
        profileAvatarConversation = `a[${attr.conversationAvatar}]:first ${div.profileAvatarUnknown}:first, ${div.profileAvatarUnknown}:first`,
        profilePopup = `div[${attr.profilePopup}]`,
        profileStats = `div:has(> a[href*="header_photo"]):has(div[${attr.profileUserName}], a[${attr.profileFollowers}])`,
        quoteTweetUserName = `${div.quoteTweet} div[${attr.tweetUserName}]`,
        quoteTweetProfileAvatar = `${div.quoteTweet} div[${attr.profileAvatar}]`,
      }
      export enum a {
        tweetId = `${div.tweet} a[${attr.tweetId}]`,
        retweetUserName = `${div.tweet} a[role="link"][dir="ltr"], ${div.notification} a[role="link"][dir="ltr"]`,
        tweetUserName = `${div.tweet} a[role="link"]:not([dir="ltr"]), ${div.notification} a[role="link"]:not([dir="ltr"])`,
        avatarConversation = `a[${attr.conversationAvatar}], a:not([href*="/follow"], [href*="messages"])`,
        profileFollowing = `a[${attr.profileFollowing}]`,
        profileFollowers = `a[${attr.profileFollowers}]`,
      }
      export enum span {
        quoteTweetUserName = `${div.quoteTweet} div[${attr.tweetUserName}]`,
        grokProfileSummary = `span:contains("${value.grokProfileSummary}")`,
      }
    }
  }
}
