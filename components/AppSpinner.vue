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
  <div class="flex items-center justify-center gap-2">
    <div
      class="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent"
    />
    <span
      v-if="message"
      class="text-sm text-muted-foreground"
    >
      {{ message }}
    </span>
  </div>
</template>
