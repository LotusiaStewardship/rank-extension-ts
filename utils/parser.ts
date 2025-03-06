export namespace Parser {
  /** Parser methods for the Twitter platform */
  export namespace Twitter {
    /** Parser methods for Twitter URL */
    export class URL {}
    /** Parser methods for Tweet DOM elements */
    export class Article {
      public static postTextFromElement = (
        postTextElement: JQuery<HTMLElement>,
      ) => postTextElement.children('span').first().text()
      public static profileIdFromElement = (
        userNameLinkElement: JQuery<HTMLElement>,
      ) => userNameLinkElement.attr('href')?.split('/').pop()
      public static profileIdFromAvatar = (
        avatarElement: JQuery<HTMLElement>,
      ) => avatarElement.attr('data-testid')!.split('-').pop()!
      public static quoteProfileIdFromElement = (
        quoteUserNameDiv: JQuery<HTMLElement>,
      ) => quoteUserNameDiv.find('span:contains("@")').text().slice(1)
      public static postIdFromElement = (
        postIdElement: JQuery<HTMLElement>,
      ) => {
        const uriArray = postIdElement.attr('href')!.split('/')
        const statusUriIndex = uriArray.findIndex(uri => uri == 'status')
        return uriArray[statusUriIndex + 1]
      }
    }
  }
}
