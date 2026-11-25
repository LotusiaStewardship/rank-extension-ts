<script setup lang="ts">
import { LKeyValue, LStat } from '@lotusia/ui'
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

const formattedTotalVotes = computed(() => {
  return props.data?.totalVotes?.toLocaleString() || '0'
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

/** The activity timeline rows, terms and descriptions as data */
const activityItems = computed(() => [
  { term: 'First Seen', description: formattedFirstSeen.value },
  { term: 'Last Seen', description: formattedLastSeen.value },
])
</script>

<template>
  <div class="space-y-6">
    <!-- Main Stats Cards -->
    <div class="flex flex-row gap-4">
      <!-- Burned Today -->
      <LStat class="flex-1" label="Burned Today" :value="formattedTotalSats" unit="XPI" />
      <!-- Total Votes -->
      <LStat class="flex-1" label="Total Votes" :value="formattedTotalVotes" />
    </div>

    <!-- Activity Timeline -->
    <LKeyValue :items="activityItems" />

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
