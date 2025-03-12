import type { ScriptChunkPlatformUTF8 } from '@/utils/rank-lib'
// Storage value types
type WxtStorageValueString = string
// Storage item definition types
type WxtStorageItemString = ReturnType<
  typeof storage.defineItem<WxtStorageValueString>
>
type WxtStorageItem = WxtStorageItemString
export type InstanceState = {
  /** ID of the specific installed instance of the extension */
  id: WxtStorageValueString
  /** The operating system on which this extension instance was installed */
  os: WxtStorageValueString
}

export type PostMetaCacheKey = `postMetaCache:${ScriptChunkPlatformUTF8}`
export type PostMetaCache = Map<string, PostMeta>
export type PostMeta = {
  hasWalletUpvoted: boolean
  hasWalletDownvoted: boolean
  txidsUpvoted: string[]
  txidsDownvoted: string[]
}

class InstanceStore {
  private wxtStorageItems!: Record<
    keyof InstanceState | PostMetaCacheKey,
    WxtStorageItem
  >
  /** Key is in format: <platform>:<profileId>:<postId> */
  private postMetaCache: Map<string, PostMeta>
  /** 20-byte, hex-encoded PKH of the active wallet address */

  constructor() {
    this.postMetaCache = new Map()
    this.wxtStorageItems = {
      id: storage.defineItem<WxtStorageValueString>('local:instance:id', {
        init: () => '',
      }),
      os: storage.defineItem<WxtStorageValueString>('local:instance:os', {
        init: () => '',
      }),
    } as typeof this.wxtStorageItems
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
      const items = await storage.getItems(itemKeys)
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
   * Get the value for the `os` localstorage item, e.g. `linux`, `mac`, etc.
   * @returns
   */
  async getOs() {
    return await this.wxtStorageItems.os.getValue()
  }
  /**
   * Set the value for the `os` localstorage item, e.g. `linux`, `mac`, etc.
   * @param os
   */
  async setOs(os: string) {
    try {
      await this.wxtStorageItems.os.setValue(os)
    } catch (e) {
      console.error(`setOs: ${os}: ${e}`)
    }
  }
  async getInstanceId() {
    return await this.wxtStorageItems.id.getValue()
  }
  /**
   * Set the value for the `id` localstorage item, which functions as the ID
   * for this extension instance
   * @param instanceId
   */
  async setInstanceId(instanceId: string) {
    try {
      await this.wxtStorageItems.id.setValue(instanceId)
    } catch (e) {
      console.error(`setInstanceId: ${instanceId}:`, e)
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
      await storage.setItem(`local:${storageKey}:${profileId}:${postId}`, data)
      this.postMetaCache.set(`${profileId}:${postId}`, data)
      console.log(
        `saved post ${platform}/${profileId}/${postId} to localStorage`,
      )
    } catch (e) {
      console.error(`saveCachedPost: ${platform}/${profileId}/${postId}: ${e}`)
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
    return await storage.getItem(
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
