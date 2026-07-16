<script lang="ts" setup>
/** Vue components */
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import HomeMyStats from './home/HomeMyStats.vue'
/** Types */
import type { Ref, ShallowRef } from 'vue'
import type { Unwatch as UnwatchFunction } from 'wxt/storage'
import type { ScriptChunkPlatformUTF8 } from '@/utils/rank-lib'
import type { AuthorizationHeader, AuthenticateHeader } from '@/entrypoints/background/modules/instance'
/** Modules */
import { InstanceTools } from '@/entrypoints/background/modules/instance'
import { instanceStore } from '@/entrypoints/background/stores/instance'
import { WalletTools } from '@/entrypoints/background/modules/wallet'
import { walletMessaging } from '@/entrypoints/background/messaging'
import { authorizedFetch } from '@/utils/functions'
/**
 * Vue definitions
 */

/**
 * Local types
 */
/**  */
type MyStats = {
  firstSeen: string
  lastSeen: string
  scriptPayload: string
  totalSats: string
  totalVotes: number
}
/**  */
type RankStatistics = {
  ranking: string
  votesPositive: number
  votesNegative: number
}
/**  */
type TopProfile = {
  total: RankStatistics
  changed: RankStatistics & {
    rate: string
  }
  votesTimespan: string[]
  profileId: string
  platform: ScriptChunkPlatformUTF8
}
/**  */
type TopPost = TopProfile & {
  postId: string
}
/**  */
type Tab = 'myStats' | 'topProfiles' | 'topPosts'
/** Twitter URL generator */
const Twitter = {
  url: 'https://x.com',
  profileUrl(profileId: string) {
    return `${this.url}/${profileId}`
  },
  postUrl(profileId: string, postId: string) {
    return `${this.url}/${profileId}/status/${postId}`
  },
}
/** RANK API endpoint */
const API = {
  url: 'https://rank.lotusia.org/api/v1',
  //url: 'http://172.16.2.20:10655/api/v1',
  myStatsSummary() {
    return `${this.url}/wallet/summary/${instanceId.value}/${walletScriptPayload.value}`
  },
  topProfiles() {
    return `${this.url}/stats/profiles/top-ranked/today`
  },
  topPosts() {
    return `${this.url}/stats/posts/top-ranked/today`
  },
}
/**
 * Vue refs
 */
const watchers: Map<'instanceId', UnwatchFunction> = new Map()
/** My stats */
const myStats: Ref<MyStats | null> = ref(null)
/** Top 5 daily profiles */
const topProfiles: Ref<TopProfile[]> = ref([])
/** Top 5 daily posts */
const topPosts: Ref<TopPost[]> = ref([])
/** Active tab */
const activeTab: ShallowRef<Tab> = shallowRef('myStats')
/** Loading message */
const loadingMessage: Ref<string> = ref('')
/** Auto-update interval */
const interval: Ref<number> = ref(0)
/** Instance ID */
const instanceId: ShallowRef<string> = shallowRef('')
/** Current status of extension registration with Lotusia Stewardship */
const registerStatus: ShallowRef<boolean> = shallowRef(false)
/** Current authorization header */
const authorizationHeader = ref('')
/** Current wallet script payload */
const walletScriptPayload = inject('wallet-script-payload') as ShallowRef<string>

/**
 * Functions
 */
/** Window functions */
const { setInterval, clearInterval } = window
/**
 * Get home page data
 */
async function hydrateHomePage() {
  console.log('hydrating home page')
  // 5/20/25: disabled until backend registration is enabled
  // 8/6/25: enabled again 
  if (instanceId.value && walletScriptPayload.value) {
    myStats.value = (await getMyStats()) || ({} as MyStats)
  }
  topProfiles.value = await getTopProfiles()
  topPosts.value = await getTopPosts()
  //getMyStats().then(result => myStats.value = result!.pop() as ScriptPayloadActivitySummary)
  //getTopProfiles().then(result => (topProfiles.value = result))
  //getTopPosts().then(result => (topPosts.value = result))
}
/**
 * Get my stats
 * @param headers - Optional response headers from a "401 Unauthorized" API response
 * @returns {Promise<ScriptPayloadActivitySummary | null>}
 */
async function getMyStats(): Promise<MyStats> {
  loadingMessage.value = 'Fetching stats...'
  // try to fetch data with the existing authorization header
  // authorizedFetch will throw the response headers if the request is unauthorized
  try {
    const result = await authorizedFetch(API.myStatsSummary(), {
      Authorization: authorizationHeader.value,
    })
    return result[0] as MyStats
  } catch (headers) {
    const result = await createAuthorizationHeader(headers as Headers)
    if (result) {
      // store the new authorization header
      await instanceStore.setAuthorizationHeader(result)
      // set the new authorization header in the Vue ref
      // will be used in the next authorizedFetch call
      authorizationHeader.value = result
      // try again with the new authorization header
      return await getMyStats()
    }
    return {} as MyStats
  }
}
/**
 * Get top profiles
 * @returns {Promise<TopProfile[]>}
 */
async function getTopProfiles(): Promise<TopProfile[]> {
  try {
    const result = await fetch(API.topProfiles())
    return (await result.json()) as TopProfile[]
  } catch (e) {
    return []
  }
}
/**
 * Get top posts
 * @returns {Promise<TopPost[]>}
 */
async function getTopPosts(): Promise<TopPost[]> {
  try {
    const result = await fetch(API.topPosts())
    return (await result.json()) as TopPost[]
  } catch (e) {
    return []
  }
}
/**
 * Create a new authorization header
 * @param headers - Optional response headers from a "401 Unauthorized" API response
 * @returns {Promise<AuthorizationHeader | null>}
 */
async function createAuthorizationHeader(headers: Headers): Promise<AuthorizationHeader | null> {
  // make sure we have an instance ID
  if (!instanceId.value) {
    loadingMessage.value = 'Awaiting instance ID...'
    return null
  }
  const {
    parseAuthenticateHeader,
    toAuthorizationHeader,
  } = InstanceTools
  // create a new authorization header
  loadingMessage.value = 'Refreshing auth data...'
  // get the WWW-Authenticate header from the provided response headers
  // this header is guaranteed to be present since the request was unauthorized
  const authenticateHeader = headers.get('www-authenticate')! as AuthenticateHeader
  const blockData = parseAuthenticateHeader(authenticateHeader)
  if (!blockData) {
    console.error(
      'Failed to parse authenticate header',
      authenticateHeader,
      blockData,
    )
    return null
  }
  // create the authorization data string (payload)
  const authDataStr = JSON.stringify({
    instanceId: instanceId.value,
    scriptPayload: walletScriptPayload.value,
    ...blockData,
  })
  // sign the payload using the stored signing key for one-time use
  const signature = WalletTools.signMessage(
    authDataStr,
    await walletMessaging.sendMessage('popup:loadSigningKey', undefined),
  )
  // create and return the authorization header
  return toAuthorizationHeader(authDataStr, signature)
}
/**
 * Vue lifecycle hooks
 */
/**  */
onMounted(async () => {
  // hydrate refs from storage
  instanceId.value = await instanceStore.getInstanceId()
  authorizationHeader.value = await instanceStore.getAuthorizationHeader()
  registerStatus.value = await instanceStore.getRegisterStatus()
  watchers.set('instanceId', instanceStore.instanceIdStorageItem.watch(
    (newInstanceId) => {
      instanceId.value = newInstanceId
    },
  ))
  // hydrate refs from RANK API
  await hydrateHomePage()
  // set up auto-update interval if not already set
  if (!interval.value) {
    interval.value = setInterval(hydrateHomePage, 5_000)
  }
})
/**  */
onBeforeUnmount(() => {
  clearInterval(interval.value)
  watchers.forEach((unwatch) => unwatch())
})
</script>

<template>
  <Tabs v-model="activeTab" class="w-full">
    <TabsList class="w-full justify-start border-b border-gray-200 dark:border-gray-700 rounded-none bg-transparent h-auto p-0 gap-0">
      <TabsTrigger tab-value="myStats"
        class="rounded-none border-b-2 border-transparent data-[state=active]:border-pink-500 data-[state=active]:text-pink-600 dark:data-[state=active]:text-pink-300 data-[state=active]:shadow-none pb-2.5 px-4 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
        My Stats
      </TabsTrigger>
      <TabsTrigger tab-value="topProfiles"
        class="rounded-none border-b-2 border-transparent data-[state=active]:border-pink-500 data-[state=active]:text-pink-600 dark:data-[state=active]:text-pink-300 data-[state=active]:shadow-none pb-2.5 px-4 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
        Trending Profiles
      </TabsTrigger>
      <TabsTrigger tab-value="topPosts"
        class="rounded-none border-b-2 border-transparent data-[state=active]:border-pink-500 data-[state=active]:text-pink-600 dark:data-[state=active]:text-pink-300 data-[state=active]:shadow-none pb-2.5 px-4 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">

        Trending Posts
      </TabsTrigger>
    </TabsList>

    <TabsContent tab-value="myStats" class="mt-0">
      <div v-if="!myStats" class="flex justify-center items-center py-8">
        <div class="h-5 w-5 animate-spin rounded-full border-2 border-pink-500 border-t-transparent" />
        <span class="text-sm text-gray-500 dark:text-gray-400 ml-2">{{ loadingMessage }}</span>
      </div>
      <HomeMyStats v-else :data="myStats" />
    </TabsContent>
    <TabsContent tab-value="topProfiles" class="mt-0">
      <div class="divide-y divide-gray-100 dark:divide-gray-800">
        <template v-for="({ profileId, changed, total, platform }, index) in topProfiles" :key="index">
          <div class="flex items-center justify-between py-2.5 px-0">
            <div class="min-w-0 flex-1">
              <a :href="Twitter.profileUrl(profileId)" target="_blank"
                class="text-sm font-medium text-gray-900 dark:text-gray-100 hover:text-pink-600 dark:hover:text-pink-300 transition-colors truncate block">
                {{ profileId }}
              </a>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{{ platform }}</p>
            </div>
            <div class="text-right ml-4 shrink-0">
              <p class="text-sm font-semibold text-pink-600 dark:text-pink-300">+{{ toMinifiedNumber(changed.ranking, 1_000_000) }}&nbsp;XPI</p>
              <p class="text-xs text-gray-500 dark:text-gray-400">{{ toMinifiedNumber(total.ranking, 1_000_000) }}&nbsp;XPI</p>
            </div>
          </div>
        </template>
      </div>
      <p v-if="topProfiles.length === 0" class="text-sm text-gray-400 dark:text-gray-500 text-center py-6">No trending profiles available</p>
    </TabsContent>
    <TabsContent tab-value="topPosts" class="mt-0">
      <div class="divide-y divide-gray-100 dark:divide-gray-800">
        <template v-for="({ profileId, postId, changed, total, platform }, index) in topPosts" :key="index">
          <div class="flex items-center justify-between py-2.5 px-0">
            <div class="min-w-0 flex-1">
              <a :href="Twitter.postUrl(profileId, postId)" target="_blank"
                class="text-sm font-medium text-gray-900 dark:text-gray-100 hover:text-pink-600 dark:hover:text-pink-300 transition-colors truncate block">
                {{ profileId }}
              </a>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{{ platform }} <span class="text-gray-400 dark:text-gray-500">· post</span></p>
            </div>
            <div class="text-right ml-4 shrink-0">
              <p class="text-sm font-semibold text-pink-600 dark:text-pink-300">+{{ toMinifiedNumber(changed.ranking, 1_000_000) }}&nbsp;XPI</p>
              <p class="text-xs text-gray-500 dark:text-gray-400">{{ toMinifiedNumber(total.ranking, 1_000_000) }}&nbsp;XPI</p>
            </div>
          </div>
        </template>
      </div>
      <p v-if="topPosts.length === 0" class="text-sm text-gray-400 dark:text-gray-500 text-center py-6">No trending posts available</p>

    </TabsContent>
  </Tabs>
</template>
