<script lang="ts" setup>
import MainLayout from '@/components/layouts/Main.vue'

const isDarkMode = computed({
  get: () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  set: (colorScheme) => {
    isDarkMode.value = colorScheme
  }
})

const strokeColor = computed(() => {
  return isDarkMode.value ? '#ff88b0' : '#c6005c'
})

provide('isDarkMode', isDarkMode)
provide('strokeColor', strokeColor)
</script>

<template>
  <div
    :style="{ width: '380px', height: '600px' }"
    class="bg-background text-foreground flex flex-col overflow-hidden"
  >
    <MainLayout />
  </div>
</template>
