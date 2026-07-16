<script setup lang="ts">
import CameraIcon from '@/components/icons/Camera.vue'

defineProps<{
  /** @deprecated Color is now fixed to primary (pink). Kept for backward compatibility. */
  color?: 'pink'
}>()
</script>

<template>
  <button
    class="inline-flex items-center justify-center rounded-lg border border-primary p-1.5 text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 transition-colors"
    aria-label="Scan QR code"
  >
    <CameraIcon />
  </button>
</template>
