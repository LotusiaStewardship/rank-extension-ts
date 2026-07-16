<script lang="ts" setup>
import AppSpinner from '@/components/AppSpinner.vue'

const props = defineProps<{
  message: string
}>()
</script>
<template>
  <div class="flex justify-center items-center py-4">
    <AppSpinner />
    <span class="font-medium text-xl text-gray-800 dark:text-gray-300 ml-2">{{ props.message }}</span>
  </div>
</template>