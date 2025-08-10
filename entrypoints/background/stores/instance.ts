import type { ScriptChunkPlatformUTF8 } from '@/utils/rank-lib'
import assert from 'assert'
import { AuthorizationHeader } from '../modules/instance'
const { defineItem, setItem, setItems, getItem, getItems } = storage
// Storage value types
type WxtStorageValueString = string
type WxtStorageValueNumber = number
type WxtStorageValueBoolean = boolean
type WxtStorageValueDate = Date
type WxtStorageValueObject = BlockDataSig
// Storage item definition types
type WxtStorageItemString = ReturnType<typeof defineItem<WxtStorageValueString>>
type WxtStorageItemNumber = ReturnType<typeof defineItem<WxtStorageValueNumber>>
type WxtStorageItemBoolean = ReturnType<
  typeof defineItem<WxtStorageValueBoolean>
>
type WxtStorageItemDate = ReturnType<typeof defineItem<WxtStorageValueDate>>
type WxtStorageItemObject = ReturnType<typeof defineItem<WxtStorageValueObject>>
type WxtStorageItem =
  | WxtStorageItemString
  | WxtStorageItemNumber
  | WxtStorageItemBoolean
  | WxtStorageItemDate
  | WxtStorageItemObject

export type PostMetaCacheKey = `postMetaCache:${ScriptChunkPlatformUTF8}`
export type PostMetaCache = Map<string, PostMeta>
export type PostMeta = {
  hasWalletUpvoted: boolean
  hasWalletDownvoted: boolean
  txidsUpvoted: string[]
  txidsDownvoted: string[]
}
export type BlockDataSig = Record<'blockhash' | 'blockheight', string>
export type ExtensionInstance = {
  instanceId: string // sha256(`${runtimeId}:${startTime}:${nonce}`)
  createdAt: string
  runtimeId: string
  startTime: string
  nonce: number
  registered: boolean
  authorizationHeader?: string
}

export const DefaultExtensionInstance: ExtensionInstance = {
  instanceId: '',
  createdAt: '',
  runtimeId: '',
  startTime: '',
  nonce: 0,
  registered: false,
}

class InstanceStore {
  private wxtStorageItems: Record<keyof ExtensionInstance, WxtStorageItem>
  /** Key is in format: <platform>:<profileId>:<postId> */
  private postMetaCache: Map<string, PostMeta>
  /** 20-byte, hex-encoded PKH of the active wallet address */

  constructor() {
    this.postMetaCache = new Map()
    this.wxtStorageItems = {
      instanceId: defineItem<WxtStorageValueString>(
        'local:instance:instanceId',
        {
          init: () => '',
        },
      ),
      createdAt: defineItem<WxtStorageValueDate>('local:instance:createdAt', {
        init: () => new Date(),
      }),
      runtimeId: defineItem<WxtStorageValueString>('local:instance:runtimeId', {
        init: () => '',
      }),
      startTime: defineItem<WxtStorageValueString>('local:instance:startTime', {
        init: () => '',
      }),
      nonce: defineItem<WxtStorageValueNumber>('local:instance:nonce', {
        init: () => 0,
      }),
      registered: defineItem<WxtStorageValueBoolean>('local:instance:optin', {
        init: () => false,
      }),
      authorizationHeader: defineItem<WxtStorageValueString>(
        'local:instance:authorizationHeader',
        {
          init: () => '',
        },
      ),
    }
  }
  get instanceIdStorageItem(): WxtStorageItemString {
    return this.wxtStorageItems.instanceId as WxtStorageItemString
  }
  /**
   * Used by popup to watch changes to opt-in status
   * @returns {WxtStorageItemBoolean}
   */
  get registeredStorageItem(): WxtStorageItemBoolean {
    return this.wxtStorageItems.registered as WxtStorageItemBoolean
  }
  /**
   * Get the `authorizationHeader` value from localStorage
   * @returns {Promise<string>}
   */
  async getAuthorizationHeader(): Promise<string> {
    return await (
      this.wxtStorageItems.authorizationHeader as WxtStorageItemString
    ).getValue()
  }
  /**
   * Set the `authorizationHeader` value in localStorage
   * @param authorizationHeader - The `authorizationHeader` value to set
   * @returns {Promise<void>}
   */
  async setAuthorizationHeader(
    authorizationHeader: AuthorizationHeader,
  ): Promise<void> {
    try {
      await (
        this.wxtStorageItems.authorizationHeader as WxtStorageItemString
      ).setValue(authorizationHeader)
    } catch (e) {
      console.error(`setAuthorizationHeader: ${authorizationHeader}:`, e)
    }
  }
  /**
   * Get the `ExtensionInstance` object from localStorage
   * @returns {Promise<ExtensionInstance>}
   */
  async getInstance(): Promise<ExtensionInstance> {
    const instance: Partial<ExtensionInstance> = {}
    try {
      const entries = await getItems(
        (
          Object.keys(this.wxtStorageItems) as Array<keyof ExtensionInstance>
        ).map(key => this.wxtStorageItems[key]),
      )
      while (entries.length > 0) {
        const item = entries.shift()
        assert(item, 'item is undefined.. corrupt instanceStore?')
        const storeKey = item.key.split(':').pop() as keyof ExtensionInstance
        instance[storeKey] = item.value
      }
      //return Object.fromEntries(
      //  entries.map(({ key, value }) => [key.split(':').pop(), value]),
      //) as ExtensionInstance
    } catch (e) {
      console.error(`getInstance:`, e)
    }
    return instance as ExtensionInstance
  }
  /**
   * Parse each `PostMeta` object from localStorage into the `postMetaCache` Map for
   * runtime use in the platform content-scripts.
   * @param platform - string value of type `ScriptChunkPlatformUTF8`
   * @returns {PostMetaCache}
   */
  async getPostMetaCache(
    scriptPayload: string,
    platform: ScriptChunkPlatformUTF8,
  ): Promise<PostMetaCache> {
    try {
      const storageKey = `instance:${scriptPayload}:postMetaCache:${platform}`
      const itemKeys = (await browser.storage.local.getKeys())
        .filter((key: string) => key.includes(storageKey))
        .map(key => `local:${key}`) as `local:${string}`[]
      const items = await getItems(itemKeys)
      items.forEach(item => {
        this.postMetaCache.set(
          item.key.replace(`local:${storageKey}:`, ''),
          item.value,
        )
      })
    } catch (e) {
      console.error(`getPostMetaCache:`, e)
    }
    return this.postMetaCache
  }
  /**
   *
   * @param instance
   */
  async saveExtensionInstance(instance: ExtensionInstance) {
    console.log('saving extension instance to localStorage')
    try {
      await setItems(
        (Object.keys(instance) as Array<keyof ExtensionInstance>).map(key => ({
          item: this.wxtStorageItems[key],
          value: instance[key],
        })),
      )
    } catch (e) {
      console.error(`saveExtensionInstance:`, e)
    }
  }
  async getInstanceId() {
    return await (
      this.wxtStorageItems.instanceId as WxtStorageItemString
    ).getValue()
  }
  /**
   * Set the value for the `id` localstorage item, which functions as the ID
   * for this extension instance
   * @param instanceId
   */
  async setInstanceId(instanceId: string) {
    try {
      await (this.wxtStorageItems.instanceId as WxtStorageItemString).setValue(
        instanceId,
      )
    } catch (e) {
      console.error(`setInstanceId: ${instanceId}:`, e)
    }
  }
  /**
   *
   * @returns
   */
  async getRegisterStatus() {
    return await (
      this.wxtStorageItems.registered as WxtStorageItemBoolean
    ).getValue()
  }
  /**
   *
   * @param answer
   */
  async setRegisterStatus(answer: boolean) {
    try {
      await (this.wxtStorageItems.registered as WxtStorageItemBoolean).setValue(
        answer,
      )
    } catch (e) {
      console.error(`setRegisterStatus: ${answer}:`, e)
    }
  }
  /**
   * Set the `PostMeta` data for the post according to `platform`, `profileId`, and `postId`
   * @param platform - string value of type `ScriptChunkPlatformUTF8`
   * @param profileId
   * @param postId
   * @param data
   * @returns {Promise<void>}
   */
  async setPostMeta(
    scriptPayload: string,
    platform: ScriptChunkPlatformUTF8,
    profileId: string,
    postId: string,
    data: PostMeta,
  ): Promise<void> {
    const storageKey = `instance:${scriptPayload}:postMetaCache:${platform}`
    try {
      await setItem(`local:${storageKey}:${profileId}:${postId}`, data)
      this.postMetaCache.set(`${profileId}:${postId}`, data)
      console.log(
        `saved post ${platform}/${profileId}/${postId} to localStorage`,
      )
    } catch (e) {
      console.error(`setPostMeta: ${platform}/${profileId}/${postId}: ${e}`)
    }
  }
  /**
   * Get the `PostMeta` data for the post according to `platform`, `profileId`, and `postId`
   * @param platform - string value of type `ScriptChunkPlatformUTF8`
   * @param profileId
   * @param postId
   * @returns {Promise<PostMeta>}
   */
  async getPostMeta(
    platform: ScriptChunkPlatformUTF8,
    profileId: string,
    postId: string,
  ): Promise<PostMeta> {
    return await getItem(
      `local:instance:vote:${platform}:${profileId}:${postId}`,
      {
        fallback: {
          hasWalletUpvoted: false,
          hasWalletDownvoted: false,
          txidsUpvoted: [],
          txidsDownvoted: [],
        } as PostMeta,
      },
    )
  }
}

const instanceStore = new InstanceStore()
export { instanceStore }
