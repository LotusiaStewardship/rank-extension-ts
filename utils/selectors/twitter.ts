/**
 * Copyright 2025-2026 The Lotusia Stewardship
 * Github: https://github.com/LotusiaStewardship
 * License: MIT
 */
// ─── Twitter > Container ──────────────────────────────────────────────────────

export const TwitterContainerAttr = {
  timeline: 'aria-label*="timeline"',
  root: `react-root`,
  primaryColumn: `data-testid="primaryColumn"`,
  sidebarColumn: `data-testid="sidebarColumn"`,
} as const

export const TwitterContainerDiv = {
  timeline: `div[${TwitterContainerAttr.timeline}], div[aria-label*="Timeline"]`,
  root: `div#${TwitterContainerAttr.root}`,
  primaryColumn: `div[${TwitterContainerAttr.primaryColumn}]`,
  sidebarColumn: `div[${TwitterContainerAttr.sidebarColumn}]`,
} as const

// ─── Twitter > Article ────────────────────────────────────────────────────────

export const TwitterArticleValue = {
  innerDiv: 'cellInnerDiv',
  notification: 'notification',
  tweet: 'tweet',
  directMessage: 'conversation',
  tweetComplete: 'tweet-text-show-more-link',
  tweetText: 'tweetText',
  tweetPhoto: 'tweetPhoto',
  tweetUserName: 'User-Name',
  profilePopup: 'HoverCard',
  profileFollowing: '/following',
  profileFollowers: '/verified_followers',
  conversationAvatar: 'DM_Conversation_Avatar',
  profileAvatar: 'UserAvatar-Container',
  profileAvatarUnknown: 'UserAvatar-Container-unknown',
  profileUserName: 'UserName',
  tweetId: '/status/',
  tweetLikeButton: 'like',
  tweetUserAvatar: 'Tweet-User-Avatar',
  tweetUnlikeButton: 'unlike',
  votePositiveButton: 'upvote',
  voteNegativeButton: 'downvote',
  grokActions: 'Grok actions',
  grokAsk: 'Ask Grok yourself',
  grokProfileSummary: 'Profile Summary',
  grokDrawer: 'GrokDrawer',
  scrollSnapList: 'ScrollSnap-List',
  roleLink: 'link',
} as const

export const TwitterArticleAttr = {
  innerDiv: `data-testid="${TwitterArticleValue.innerDiv}"`,
  notification: `data-testid="${TwitterArticleValue.notification}"`,
  tweet: `data-testid="${TwitterArticleValue.tweet}"`,
  directMessage: `data-testid="${TwitterArticleValue.directMessage}"`,
  tweetComplete: `data-testid="${TwitterArticleValue.tweetComplete}"`,
  tweetText: `data-testid="${TwitterArticleValue.tweetText}"`,
  tweetPhoto: `data-testid="${TwitterArticleValue.tweetPhoto}"`,
  tweetUserName: `data-testid="${TwitterArticleValue.tweetUserName}"`,
  profilePopup: `data-testid="${TwitterArticleValue.profilePopup}"`,
  profileFollowing: `href$="${TwitterArticleValue.profileFollowing}"`,
  profileFollowers: `href$="${TwitterArticleValue.profileFollowers}"`,
  conversationAvatar: `data-testid="${TwitterArticleValue.conversationAvatar}"`,
  profileAvatar: `data-testid^="${TwitterArticleValue.profileAvatar}"`,
  profileAvatarUnknown: `data-testid="${TwitterArticleValue.profileAvatarUnknown}"`,
  profileUserName: `data-testid="${TwitterArticleValue.profileUserName}"`,
  tweetId: `href*="${TwitterArticleValue.tweetId}"`,
  tweetLikeButton: `data-testid="${TwitterArticleValue.tweetLikeButton}"`,
  tweetUnlikeButton: `data-testid="${TwitterArticleValue.tweetUnlikeButton}"`,
  tweetUserAvatar: `data-testid="${TwitterArticleValue.tweetUserAvatar}"`,
  votePositiveButton: `data-testid="${TwitterArticleValue.votePositiveButton}"`,
  voteNegativeButton: `data-testid="${TwitterArticleValue.voteNegativeButton}"`,
  grokActions: `aria-label="${TwitterArticleValue.grokActions}"`,
  grokProfileSummary: `aria-label="${TwitterArticleValue.grokProfileSummary}"`,
  grokDrawer: `data-testid="${TwitterArticleValue.grokDrawer}"`,
  grokScrollList: `data-testid="${TwitterArticleValue.scrollSnapList}"`,
  roleLink: `role="${TwitterArticleValue.roleLink}"`,
} as const

export const TwitterArticleButton = {
  tweetLikeButton: `button[${TwitterArticleAttr.tweetLikeButton}]`,
  tweetUnlikeButton: `button[${TwitterArticleAttr.tweetUnlikeButton}]`,
  postUpvoteButton: `button[${TwitterArticleAttr.votePositiveButton}]`,
  postDownvoteButton: `button[${TwitterArticleAttr.voteNegativeButton}]`,
  // This button is not loaded with the post — it is injected afterwards,
  // so we cannot use the tweet selector as an ancestor.
  grokActions: `button[${TwitterArticleAttr.grokActions}]`,
  grokAsk: `button:has(span:contains("${TwitterArticleValue.grokAsk}"))`,
  grokProfileSummary: `button[${TwitterArticleAttr.grokProfileSummary}], button:has(span:contains("${TwitterArticleValue.grokProfileSummary}"))`,
} as const

export const TwitterArticleDiv = {
  innerDiv: `div[${TwitterArticleAttr.innerDiv}]`,
  tweet: `article[${TwitterArticleAttr.tweet}]`,
  get quoteTweet() {
    return `${this.tweet} div[${TwitterArticleAttr.roleLink}][tabindex]:has(div[${TwitterArticleAttr.profileAvatar}])`
  },
  notification: `article[${TwitterArticleAttr.notification}]`,
  directMessage: `div[${TwitterArticleAttr.directMessage}]`,
  get ad() {
    return `div[data-testid="placementTracking"]:has(${this.tweet})`
  },
  get buttonRow() {
    return `div[role="group"]:has(${TwitterArticleButton.tweetLikeButton}, ${TwitterArticleButton.tweetUnlikeButton}):only-of-type`
  },
  grokScrollList: `div[data-testid*="followups"] + nav:has(div[${TwitterArticleAttr.grokScrollList}])`,
  grokDrawer: `div[${TwitterArticleAttr.grokDrawer}]`,
  get tweetText() {
    return `${this.tweet} div[${TwitterArticleAttr.tweetText}]`
  },
  get tweetUserName() {
    return `${this.tweet} div[${TwitterArticleAttr.tweetUserName}]`
  },
  profileAvatar: `div[${TwitterArticleAttr.profileAvatar}]:not([${TwitterArticleAttr.profileAvatarUnknown}])`,
  profileAvatarUnknown: `div[${TwitterArticleAttr.profileAvatarUnknown}]`,
  get profileAvatarConversation() {
    return `a[${TwitterArticleAttr.conversationAvatar}] ${this.profileAvatarUnknown}, div:has(${this.profileAvatarUnknown} ~ div:has(a[${TwitterArticleAttr.roleLink}]))`
  },
  profilePopup: `div[${TwitterArticleAttr.profilePopup}]`,
  profileStats: `div:has(> a[href*="header_photo"]):has(div[${TwitterArticleAttr.profileUserName}], a[${TwitterArticleAttr.profileFollowers}])`,
  get quoteTweetUserName() {
    return `${this.quoteTweet} div[${TwitterArticleAttr.tweetUserName}]`
  },
  get quoteTweetProfileAvatar() {
    return `${this.quoteTweet} div[${TwitterArticleAttr.profileAvatar}]`
  },
} as const

export const TwitterArticleA = {
  get tweetId() {
    return `${TwitterArticleDiv.tweet} a[${TwitterArticleAttr.tweetId}]`
  },
  get retweetUserName() {
    return `${TwitterArticleDiv.tweet} a[role="link"][dir="ltr"], ${TwitterArticleDiv.notification} a[role="link"][dir="ltr"]`
  },
  get tweetUserName() {
    return `${TwitterArticleDiv.tweet} a[role="link"]:not([dir="ltr"]), ${TwitterArticleDiv.notification} a[role="link"]:not([dir="ltr"])`
  },
  conversationAvatar: `a[${TwitterArticleAttr.conversationAvatar}], a:not([href*="/followers_you_follow"])`,
  profileFollowing: `a[${TwitterArticleAttr.profileFollowing}]`,
  profileFollowers: `a[${TwitterArticleAttr.profileFollowers}]`,
} as const

export const TwitterArticleSpan = {
  get quoteTweetUserName() {
    return `${TwitterArticleDiv.quoteTweet} div[${TwitterArticleAttr.tweetUserName}]`
  },
  grokProfileSummary: `span:contains("${TwitterArticleValue.grokProfileSummary}")`,
} as const
