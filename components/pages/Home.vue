<script lang="ts" setup>
/** Vue components */
import { FwbHeading, FwbP, FwbTab, FwbTabs } from 'flowbite-vue'
/** Modules and types */
import type { ScriptChunkPlatformUTF8 } from '@/utils/rank-lib'
import type { ShallowRef } from 'vue'
/** */
type RankStatistics = {
  ranking: string
  votesPositive: number
  votesNegative: number
}
type TopProfile = {
  total: RankStatistics
  changed: RankStatistics & {
    rate: string
  }
  votesTimespan: string[]
  profileId: string
  platform: ScriptChunkPlatformUTF8
}
type TopPost = TopProfile & {
  postId: string
}
type Tab = 'topProfiles' | 'topPosts'
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
  async topProfiles() {
    try {
      const result = await fetch(
        `${this.url}/stats/profiles/top-ranked/today`,
      )
      return (await result.json()) as TopProfile[]
    } catch (e) {
      return []
    }
  },
  async topPosts() {
    try {
      const result = await fetch(
        `${this.url}/stats/posts/top-ranked/today`,
      )
      return (await result.json()) as TopPost[]
    } catch (e) {
      return []
    }
  },
}
/**
 * Local types
 */
/**
 * Constants
 */
/** Top 5 daily profiles */
const topProfiles: Ref<TopProfile[]> = ref([])
/** Top 5 daily posts */
const topPosts: Ref<TopPost[]> = ref([])
const activeTab: ShallowRef<Tab> = shallowRef('topProfiles')
/**
 * Vue lifecycle hooks
 */
/**  */
onMounted(() => {
  API.topProfiles().then(result => (topProfiles.value = result))
  API.topPosts().then(result => (topPosts.value = result))
})
</script>
<template>
  <FwbTabs v-model="activeTab" variant="underline">
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
