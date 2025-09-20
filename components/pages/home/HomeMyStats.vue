<script setup lang="ts">
import { FwbHeading, FwbCard, FwbBadge } from 'flowbite-vue'
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
/**
 * Vue properties
 */
const props = defineProps<{
  data: MyStats | null
}>()

/**
 * Computed properties for formatting
 */
const formattedTotalSats = computed(() => {
  return toMinifiedNumber(props.data?.totalSats || 0, 1_000_000)
})

const formattedFirstSeen = computed(() => {
  return props.data?.firstSeen
    ? new Date(props.data.firstSeen).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric'
    })
    : ''
})

const formattedLastSeen = computed(() => {
  return props.data?.lastSeen
    ? new Date(props.data.lastSeen).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric'
    })
    : ''
})

const activityDuration = computed(() => {
  const first = new Date(props.data?.firstSeen || '')
  const last = new Date(props.data?.lastSeen || '')
  const diffTime = Math.abs(last.getTime() - first.getTime())
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  return diffDays
})
</script>

<template>
  <div class="space-y-6">
    <!-- Main Stats Cards -->
    <div class="flex flex-row gap-4">
      <!-- Burned Today Card -->
      <div class="rounded-xl p-4 flex-1">
        <div class="text-center">
          <div class="text-3xl font-bold text-pink-600 dark:text-pink-300 mb-1">
            {{ formattedTotalSats }} XPI
          </div>
          <div class="text-sm">
            Burned Today
          </div>
        </div>
      </div>

      <!-- Total Votes Card -->
      <div class="rounded-xl p-4 flex-1">
        <div class="text-center">
          <div class="text-3xl font-bold text-purple-600 dark:text-purple-300 mb-1">
            {{ data?.totalVotes?.toLocaleString() || 0 }}
          </div>
          <div class="text-sm">
            Total Votes
          </div>
        </div>
      </div>
    </div>

    <!-- Activity Timeline -->
    <div class="rounded-xl p-6">
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium">
            First Seen
          </span>
          <div class="bg-blue-200 dark:bg-blue-600 text-xs px-3 py-1 rounded-lg">
            {{ formattedFirstSeen }}
          </div>
        </div>

        <div class="flex items-center justify-between">
          <span class="text-sm font-medium">
            Last Seen
          </span>
          <div class="bg-blue-200 dark:bg-blue-600 text-xs px-3 py-1 rounded-lg">
            {{ formattedLastSeen }}
          </div>
        </div>

        <!-- <div class="flex items-center justify-between">
          <span class="text-sm font-medium">
            Activity Duration
          </span>
          <div class="bg-blue-600 text-xs px-3 py-1 rounded-lg">
            {{ activityDuration }} days
          </div>
        </div> -->
      </div>
    </div>

    <!-- Summary --><!-- 
    <div class="text-center py-2 px-6">
      <div class="text-sm leading-relaxed">
        You've been active for {{ activityDuration }} days with
        <span class="font-medium text-pink-500 dark:text-pink-300">{{ formattedTotalSats }}</span> total sats
        and <span class="font-medium text-purple-500 dark:text-purple-300">{{ totalVotes.toLocaleString() }}</span>
        votes cast.
      </div>
    </div> -->
  </div>
</template>