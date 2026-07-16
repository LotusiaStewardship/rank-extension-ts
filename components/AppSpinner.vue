<script setup lang="ts">
/**
 * A simple Tailwind CSS spinner component.
 * Replaces the Flowbite FwbSpinner component.
 */
defineProps<{
  message?: string
}>()
</script>

<template>
  <div class="flex justify-center items-center py-4">
    <div
      class="h-6 w-6 animate-spin rounded-full border-2 border-pink-500 border-t-transparent"
    />
    <span
      v-if="message"
      class="font-medium text-xl text-gray-800 dark:text-gray-300 ml-2"
    >
      {{ message }}
    </span>
  </div>
</template>
