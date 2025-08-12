<script setup lang="ts">
const props = defineProps<{
  txid: string | null
  error: string | null
}>()
</script>

<template>

  <div class="py-2">
    <template v-if="txid">
      <div
        class="flex items-center p-4 mb-4 text-sm text-purple-800 border border-purple-5400 rounded bg-purple-50 dark:bg-gray-800 dark:text-purple-300 dark:border-purple-400"
        role="alert">
        <svg class="shrink-0 inline w-4 h-4 me-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"
          fill="currentColor" viewBox="0 0 20 20">
          <path
            d="M10 .5a9.5 9.5 0 1 0 9.5 9.5A9.51 9.51 0 0 0 10 .5ZM9.5 4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM12 15H8a1 1 0 0 1 0-2h1v-3H8a1 1 0 0 1 0-2h2a1 1 0 0 1 1 1v4h1a1 1 0 0 1 0 2Z" />
        </svg>
        <span class="sr-only">Info</span>
        <div>
          <span class="font-medium">Lotus given successfully!</span>&nbsp;
          <span>
            (<a target="_blank" class="text-pink-500 dark:text-pink-300"
              :href="DEFAULT_EXPLORER_URL + '/tx/' + txid">View technical details</a>)
          </span>
        </div>
        <button type="button"
          class="ms-auto -mx-1.5 -my-1.5 bg-purple-50 text-purple-500 rounded focus:ring-2 focus:ring-purple-400 p-1.5 hover:bg-purple-200 inline-flex items-center justify-center h-8 w-8 dark:bg-gray-800 dark:text-purple-300"
          @click="$emit('reset')" aria-label="Close">
          <span class="sr-only">Close</span>
          <svg class="w-3 h-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 14 14">
            <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="m1 1 6 6m0 0 6 6M7 7l6-6M7 7l-6 6" />
          </svg>
        </button>
      </div>
    </template>
    <template v-else-if="error">
      <div
        class="flex items-center p-4 mb-4 text-sm text-purple-800 border border-purple-5400 rounded bg-purple-50 dark:bg-gray-800 dark:text-purple-300 dark:border-purple-400"
        role="alert">
        <svg class="shrink-0 inline w-4 h-4 me-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"
          fill="currentColor" viewBox="0 0 20 20">
          <path
            d="M10 .5a9.5 9.5 0 1 0 9.5 9.5A9.51 9.51 0 0 0 10 .5ZM9.5 4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM12 15H8a1 1 0 0 1 0-2h1v-3H8a1 1 0 0 1 0-2h2a1 1 0 0 1 1 1v4h1a1 1 0 0 1 0 2Z" />
        </svg>
        <span class="sr-only">Info</span>
        <div>
          <span class="font-medium">Error:</span>&nbsp;&nbsp;
          <span>
            {{ error }}
          </span>
        </div>
        <button type="button"
          class="ms-auto -mx-1.5 -my-1.5 bg-purple-50 text-purple-500 rounded focus:ring-2 focus:ring-purple-400 p-1.5 hover:bg-purple-200 inline-flex items-center justify-center h-8 w-8 dark:bg-gray-800 dark:text-purple-300"
          @click="$emit('reset')" aria-label="Close">
          <span class="sr-only">Close</span>
          <svg class="w-3 h-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 14 14">
            <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="m1 1 6 6m0 0 6 6M7 7l6-6M7 7l-6 6" />
          </svg>
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped></style>