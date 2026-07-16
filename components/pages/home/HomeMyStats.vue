<script setup lang="ts">
// Flowbite imports removed — all components unused in template
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
  <div>
    <!-- Stat blocks as clean key-value rows with subtle dividers -->
    <div class="divide-y divide-gray-100 dark:divide-gray-800">
      <div class="flex items-center justify-between py-3">
        <span class="text-sm text-gray-500 dark:text-gray-400">XPI Burned Today</span>
        <span class="text-lg font-semibold text-pink-600 dark:text-pink-300">{{ formattedTotalSats }} XPI</span>
      </div>
      <div class="flex items-center justify-between py-3">
        <span class="text-sm text-gray-500 dark:text-gray-400">Total Votes</span>
        <span class="text-lg font-semibold text-purple-600 dark:text-purple-300">{{ data?.totalVotes?.toLocaleString() || 0 }}</span>
      </div>
    </div>

    <!-- Activity Timeline as compact key-value rows -->
    <div class="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800">
      <div class="divide-y divide-gray-100 dark:divide-gray-800">
        <div class="flex items-center justify-between py-2">
          <span class="text-sm text-gray-500 dark:text-gray-400">First Seen</span>
          <span class="text-sm text-gray-900 dark:text-gray-100">{{ formattedFirstSeen }}</span>
        </div>
        <div class="flex items-center justify-between py-2">
          <span class="text-sm text-gray-500 dark:text-gray-400">Last Seen</span>
          <span class="text-sm text-gray-900 dark:text-gray-100">{{ formattedLastSeen }}</span>
        </div>
      </div>
    </div>
  </div>
</template>