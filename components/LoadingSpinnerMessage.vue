<script lang="ts" setup>
import AppSpinner from '@/components/AppSpinner.vue'

defineProps<{
  message: string
}>()
</script>

<template>
  <div class="flex justify-center items-center py-6">
    <AppSpinner :message="message" />
  </div>
</template>
