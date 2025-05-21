import type { BlockDataSig } from '@/entrypoints/background/stores/instance'
import { AuthorizationData, Util } from '@/utils/rank-lib'

/** blockhash or blockheight */
const authenticateParam = /blockhash=([a-f0-9]{64})|blockheight=(\d{1,10})/g
const authorizationHeaderDelimiter = ':::'
// `WWW-Authenticate:` header types
export type AuthenticateHeaderPrefix = 'WWW-Authenticate'
export type AuthenticateScheme = 'BlockDataSig'
export type AuthenticateHeader = `${AuthenticateScheme} ${string}`
// `Authorization:` header types
export type AuthorizationHeaderPrefix = 'Authorization'
export type AuthorizationHeader = string
/**
 * Tools for handling instance registration, authenticating API requests, and more
 */
class InstanceTools {
  /**
   * Create an `Authorization:` header payload from an authorization data string and signature
   * @param authDataStr - The `AuthorizationData` object in JSON string format
   * @param signature - The signature of the authorization data string
   * @returns The `Authorization:` header payload
   */
  static toAuthorizationPayload(
    authDataStr: string,
    signature: string,
  ): string {
    return Util.base64.encode(
      authDataStr + authorizationHeaderDelimiter + signature,
    )
  }
  /**
   * Validate the `BlockDataSig` object
   * @param blockDataSig - The `BlockDataSig` object
   * @returns `true` if the `BlockDataSig` object is valid, `false` otherwise
   */
  static isValidBlockData(blockDataSig: BlockDataSig): boolean {
    return (
      isSha256(blockDataSig.blockhash) &&
      !isNaN(Number(blockDataSig.blockheight))
    )
  }
  /**
   * Parse the `Authorization:` header to extract the `AuthorizationData` object
   * @param header - The `Authorization:` header
   * @returns The `AuthorizationData` object
   */
  static parseAuthorizationHeader(
    header: AuthorizationHeader,
  ): AuthorizationData | null {
    const [prefix, data] = header.split(' ') as [
      AuthorizationHeaderPrefix,
      string,
    ]
    if (prefix !== 'Authorization') {
      return null
    }
    const [authDataStr, signature] = data.split(authorizationHeaderDelimiter)
    if (!authDataStr || !signature) {
      return null
    }
    return JSON.parse(authDataStr) as AuthorizationData
  }
  /**
   * Parse the authenticate header to extract block data
   * @param header - The `WWW-Authenticate:` header containing `BlockDataSig` challenge
   * @returns The `BlockDataSig` object; used in the `Authorization:` signature
   */
  static parseAuthenticateHeader(
    header: AuthenticateHeader,
  ): BlockDataSig | null {
    const [scheme, ...blockDataSig] = header.split(' ') as [
      AuthenticateScheme,
      string[],
    ]
    switch (scheme) {
      case 'BlockDataSig': {
        const [, blockDataSig] = header.split(scheme)
        if (!blockDataSig) {
          return null
        }
        const matches = blockDataSig.match(authenticateParam)
        if (!matches || matches.length !== 2) {
          return null
        }
        const [blockhash, blockheight] = matches.map(match =>
          match.split('=').pop(),
        )
        if (!blockhash || !blockheight) {
          return null
        }
        if (!isSha256(blockhash)) {
          return null
        }
        if (isNaN(Number(blockheight))) {
          return null
        }
        return { blockhash, blockheight }
      }
      default: {
        return null
      }
    }
  }
}
export { InstanceTools }
