import { Cheerio } from 'cheerio'
import { Element } from 'domhandler'

export namespace Parser {
  /** Parser methods for Twitter URL */
  export class TwitterURL {

  }
  /** Parser methods for Tweet DOM elements */
  export class TwitterArticle {
    public static postTextFromElement = (postTextElement: Cheerio<Element>) =>
      postTextElement.children('span').first().text()
    public static profileIdFromElement = (userNameLinkElement: Cheerio<Element>) =>
      userNameLinkElement.attr('href')?.split('/')?.pop()?.toLowerCase()
    public static postIdFromElement = (postIdElement: Cheerio<Element>) => {
      const uriArray = postIdElement.attr('href')?.split('/')
      if (!uriArray) {
        return null
      }
      const statusUriIndex = uriArray.findIndex(uri => uri == 'status')
      if (statusUriIndex < 0) {
        return null
      }
      return uriArray[statusUriIndex + 1]
    }
  }
}
