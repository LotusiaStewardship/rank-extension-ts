<script lang="ts" setup>
/** Vue components */
import { FwbHeading, FwbP, FwbTab, FwbTabs } from 'flowbite-vue'
/** Modules and types */
import { Util, type ScriptChunkPlatformUTF8 } from '@/utils/rank-lib'
import type { ShallowRef } from 'vue'
import { WalletTools } from '@/entrypoints/background/modules/wallet'
import { walletMessaging } from '@/entrypoints/background/messaging'
import {
  InstanceTools,
  type AuthenticateHeader,
} from '@/entrypoints/background/modules/instance'
import type { BlockDataSig } from '@/entrypoints/background/stores/instance'

/**
 * Local types
 */
/**  */
type ScriptPayloadActivitySummary = {
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
 * Constants
 */
/** Top 5 daily profiles */
const topProfiles: Ref<TopProfile[]> = ref([])
/** Top 5 daily posts */
const topPosts: Ref<TopPost[]> = ref([])
/** Active tab */
const activeTab: ShallowRef<Tab> = shallowRef('myStats')
/** Auto-update interval */
const interval: Ref<number> = ref(0)
/**
 * Vue prop drilling
 */
const storedInstanceId = inject('instance-id') as ShallowRef<string>
const storedBlockDataSig = inject(
  'instance-block-data-sig',
) as Ref<BlockDataSig>
const storedAuthorizationHeader = inject(
  'instance-authorization-header',
) as Ref<string>
const registerStatus = inject('instance-register-status') as ShallowRef<boolean>
const walletScriptPayload = inject(
  'wallet-script-payload',
) as ShallowRef<string>
/**
 * Vue computed
 */
const hasInstanceId = computed(() => !!storedInstanceId.value)
const hasWalletScriptPayload = computed(() => !!walletScriptPayload.value)
const hasStoredAuthorizationHeader = computed(
  () => !!storedAuthorizationHeader.value,
)
/**
 * Functions
 */
/** Window functions */
const { setInterval, clearInterval } = window
/**
 * Get home page data
 */
async function getHomePageData() {
  // 5/20/25: disabled until backend registration is enabled
  /* getMyStats().then(result => console.log(result)) */
  getTopProfiles().then(result => (topProfiles.value = result))
  getTopPosts().then(result => (topPosts.value = result))
}
/**
 * Get my stats
 * @returns {Promise<ScriptPayloadActivitySummary | null>}
 */
async function getMyStats(): Promise<ScriptPayloadActivitySummary | null> {
  const headers = await createAuthorizationHeader()
  if (!headers) {
    return null
  }
  const result = await authorizedFetch(API.myStatsSummary(), headers)
  return result as ScriptPayloadActivitySummary
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
async function createAuthorizationHeader(): Promise<Record<
  string,
  string
> | null> {
  // ensure we are registered first
  /* if (!registerStatus.value) {
    console.log('not registered')
    return null
  } */
  const headers = {
    Authorization: '',
  }
  // Use stored authorization header if available
  if (hasStoredAuthorizationHeader) {
    headers.Authorization = storedAuthorizationHeader.value
  }
  console.log('getMyStats headers', headers)
  // create new authorization header if not available
  if (!headers.Authorization) {
    try {
      // fetch without authorization header to get authenticate header
      const result = await fetch(API.myStatsSummary())
      const authenticateHeader = result.headers.get(
        'www-authenticate',
      )! as AuthenticateHeader
      const blockData =
        InstanceTools.parseAuthenticateHeader(authenticateHeader)
      console.log('blockData', blockData)
      if (!blockData || !InstanceTools.isValidBlockData(blockData)) {
        console.error(
          'Failed to parse authenticate header',
          authenticateHeader,
          blockData,
        )
        return null
      }
      // set new value, which will trigger watcher in Main to update instanceStore
      storedBlockDataSig.value = blockData
      // create the authorization data string (payload)
      console.log(storedInstanceId.value, walletScriptPayload.value, blockData)
      const authDataStr = JSON.stringify({
        instanceId: storedInstanceId.value,
        scriptPayload: walletScriptPayload.value,
        ...blockData,
      })
      // sign the payload using the stored signing key for one-time use
      const signature = WalletTools.signMessage(
        authDataStr,
        await walletMessaging.sendMessage('popup:loadSigningKey', undefined),
      )
      // use the new authorization header
      // setting the storedAuthorizationHeader will trigger the watcher in Main
      // which will save the new authorization header to instanceStore
      headers.Authorization = storedAuthorizationHeader.value =
        InstanceTools.toAuthorizationPayload(authDataStr, signature)
    } catch (e) {
      console.error('createAuthorizationHeader failed:', e)
    }
  }
  // if we still don't have an authorization header, return null
  if (!headers.Authorization) {
    console.error(
      'no authorization header possible',
      storedInstanceId.value,
      walletScriptPayload.value,
      storedBlockDataSig.value,
      storedAuthorizationHeader.value,
    )
    return null
  }
  return headers
}
/**
 * Vue lifecycle hooks
 */
//onBeforeMount(async () => {})
/**  */
onBeforeUpdate(async () => {
  if (hasInstanceId && hasWalletScriptPayload && hasStoredAuthorizationHeader) {
    await getHomePageData()
    if (!interval.value) {
      interval.value = setInterval(getHomePageData, 5_000)
    }
  }
})
/**  */
onBeforeUnmount(() => {
  clearInterval(interval.value)
})
</script>
<template>
  <!-- Use computed properties in hidden div to trigger onUpdated hook -->
  <div style="display: none">
    {{ hasInstanceId }}
    {{ hasWalletScriptPayload }}
    {{ hasStoredAuthorizationHeader }}
  </div>
  <FwbTabs v-model="activeTab" variant="underline">
    <!--
      Only show myStats if registered
      5/20/25: Registration is currently disabled
    -->
    <FwbTab name="myStats" title="My Stats" v-if="registerStatus">
      <div>
        <div>
          <FwbHeading tag="h6" title="My Stats"> My Stats </FwbHeading>
        </div>
      </div>
    </FwbTab>
    <FwbTab name="topProfiles" title="Trending Profiles">
      <template
        v-for="({ profileId, changed, total, platform }, index) in topProfiles"
        :key="index"
      >
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
            <FwbHeading tag="h6" title="total"
              >+{{
                toMinifiedNumber(changed.ranking, 1_000_000)
              }}&nbsp;Lotus</FwbHeading
            >
            <fwb-p style="color: pink"
              >{{
                toMinifiedNumber(total.ranking, 1_000_000)
              }}&nbsp;Lotus</fwb-p
            >
          </div>
        </div>
      </template>
    </FwbTab>
    <FwbTab name="topPosts" title="Trending Posts">
      <template
        v-for="(
          { profileId, postId, changed, total, platform }, index
        ) in topPosts"
        :key="index"
      >
        <div class="flex py-2 px-6">
          <div class="flex-grow justify-start">
            <a :href="Twitter.postUrl(profileId, postId)" target="_blank">
              <FwbHeading tag="h6" :title="profileId">
                {{ profileId }}</FwbHeading
              >
            </a>
            <fwb-p>{{ platform }}&nbsp;<span class="text-xs">post</span></fwb-p>
          </div>
          <div class="flex-grow items-end text-right">
            <FwbHeading tag="h6" title="total"
              >+{{
                toMinifiedNumber(changed.ranking, 1_000_000)
              }}&nbsp;Lotus</FwbHeading
            >
            <fwb-p style="color: pink"
              >{{
                toMinifiedNumber(total.ranking, 1_000_000)
              }}&nbsp;Lotus</fwb-p
            >
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
