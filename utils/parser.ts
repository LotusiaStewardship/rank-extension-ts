import { Cheerio } from 'cheerio'
import { Element } from 'domhandler'

export namespace Parser {
  /** Parser methods for the Twitter platform */
  export namespace Twitter {
    /** Parser methods for Twitter URL */
    export class URL {}
    /** Parser methods for Tweet DOM elements */
    export class Article {
      public static postTextFromElement = (postTextElement: Cheerio<Element>) =>
        postTextElement.children('span').first().text()
      public static profileIdFromElement = (userNameLinkElement: Cheerio<Element>) =>
        userNameLinkElement.attr('href')?.split('/')?.pop()?.toLowerCase()!
      public static postIdFromElement = (postIdElement: Cheerio<Element>) => {
        const uriArray = postIdElement.attr('href')!.split('/')
        const statusUriIndex = uriArray.findIndex(uri => uri == 'status')
        return uriArray[statusUriIndex + 1]
      }
    }
  }
}
