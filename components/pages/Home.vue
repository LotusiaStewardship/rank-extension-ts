<script lang="ts" setup>
/** Vue components */
import { FwbHeading, FwbP, FwbTab, FwbTabs, FwbSpinner } from 'flowbite-vue'
import HomeMyStats from './home/HomeMyStats.vue'
/** Types */
import type { ShallowRef } from 'vue'
import type { Unwatch as UnwatchFunction } from 'wxt/storage'
import type { ScriptChunkPlatformUTF8 } from '@/utils/rank-lib'
import type { AuthorizationHeader, AuthorizationHeaderPrefix, AuthenticateHeader } from '@/entrypoints/background/modules/instance'
/** Modules */
import { InstanceTools } from '@/entrypoints/background/modules/instance'
import { instanceStore } from '@/entrypoints/background/stores/instance'
import { WalletTools } from '@/entrypoints/background/modules/wallet'
import { walletMessaging } from '@/entrypoints/background/messaging'
import { authorizedFetch } from '@/utils/functions'

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
    return `${this.url}/wallet/summary/${walletScriptPayload.value}`
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
 * @returns {Promise<ScriptPayloadActivitySummary | null>}
 */
async function getMyStats(): Promise<MyStats | null> {
  const headers = await createAuthorizationHeader()
  if (!headers) {
    return null
  }
  loadingMessage.value = 'Fetching stats...'
  const result = await authorizedFetch(API.myStatsSummary(), headers)
  return result[0] as MyStats | null
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
 * @returns {Promise<AuthorizationHeader | null>}
 */
async function createAuthorizationHeader(): Promise<
  | Record<AuthorizationHeaderPrefix, AuthorizationHeader>
  | null
> {
  if (authorizationHeader.value) {
    return { Authorization: authorizationHeader.value }
  }
  // make sure we have an instance ID
  if (!instanceId.value) {
    loadingMessage.value = 'Awaiting instance ID...'
    return null
  }
  // make sure we have a wallet script payload
  // create new authorization header if not available
  try {
    loadingMessage.value = 'Refreshing auth data...'
    // fetch without authorization header to get authenticate header
    const result = await fetch(API.myStatsSummary())
    const authenticateHeader = result.headers.get(
      'www-authenticate',
    )! as AuthenticateHeader
    const blockData = InstanceTools.parseAuthenticateHeader(authenticateHeader)
    if (!blockData || !InstanceTools.isValidBlockData(blockData)) {
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
    // set the new authorization header in the Vue ref
    authorizationHeader.value = InstanceTools.toAuthorizationPayload(authDataStr, signature)
    // store all of the new authorization data, including the generated header
    await instanceStore.setBlockDataSig(blockData)
    await instanceStore.setAuthorizationHeader(authorizationHeader.value)
    return { Authorization: authorizationHeader.value }
  } catch (e) {
    console.error('createAuthorizationHeader failed:', e)
    return null
  }
}
/**
 * Vue lifecycle hooks
 */
//onBeforeMount(async () => {})
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
  <FwbTabs v-model="activeTab" variant="underline">
    <!--
      Only show myStats if registered
      5/20/25: Registration is currently disabled
      8/3/25: Registration is enabled
    -->
    <FwbTab name="myStats" title="My Stats">
      <div v-show="!myStats" class="flex justify-center items-center py-4">
        <FwbSpinner size="8" />
        <span class="font-medium text-xl text-gray-300 dark:text-gray-500 ml-2">{{ loadingMessage }}</span>
      </div>
      <HomeMyStats v-show="myStats" :data="myStats" />
    </FwbTab>
    <FwbTab name="topProfiles" title="Trending Profiles">
      <template v-for="({ profileId, changed, total, platform }, index) in topProfiles" :key="index">
        <div class="flex py-2 px-6">
          <div class="flex-grow items-start text-left">
            <a :href="Twitter.profileUrl(profileId)" target="_blank">
              <FwbHeading tag="h6" :title="profileId">{{
                profileId
              }}</FwbHeading>
            </a>
            <fwb-p>{{ platform }}</fwb-p>
          </div>
          <div class="flex-grow items-end text-right">
            <FwbHeading tag="h6" title="total">+{{
              toMinifiedNumber(changed.ranking, 1_000_000)
              }}&nbsp;XPI</FwbHeading>
            <fwb-p style="color: pink">{{
              toMinifiedNumber(total.ranking, 1_000_000)
              }}&nbsp;XPI</fwb-p>
          </div>
        </div>
      </template>
    </FwbTab>
    <FwbTab name="topPosts" title="Trending Posts">
      <template v-for="(
{ profileId, postId, changed, total, platform }, index
        ) in topPosts" :key="index">
        <div class="flex py-2 px-6">
          <div class="flex-grow justify-start">
            <a :href="Twitter.postUrl(profileId, postId)" target="_blank">
              <FwbHeading tag="h6" :title="profileId">
                {{ profileId }}</FwbHeading>
            </a>
            <fwb-p>{{ platform }}&nbsp;<span class="text-xs">post</span></fwb-p>
          </div>
          <div class="flex-grow items-end text-right">
            <FwbHeading tag="h6" title="total">+{{
              toMinifiedNumber(changed.ranking, 1_000_000)
              }}&nbsp;XPI</FwbHeading>
            <fwb-p style="color: pink">{{
              toMinifiedNumber(total.ranking, 1_000_000)
              }}&nbsp;XPI</fwb-p>
          </div>
        </div>
      </template>
    </FwbTab>
  </FwbTabs>
</template>
<style lang="css" scoped>
.text-right {
  text-align: right;
}
</style>
