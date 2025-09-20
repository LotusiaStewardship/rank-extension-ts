<script lang="ts" setup>
import MainLayout from '@/components/layouts/Main.vue'
/** Height of the popup window, in pixels */
const windowHeight = shallowRef('')
/** Width of the popup window, in pixels */
const windowWidth = shallowRef('')
/**
 * Vue computed properties
 */
/** True if the system is in dark mode, false otherwise */
const isDarkMode = computed({
  get: () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  set: (colorScheme) => {
    isDarkMode.value = colorScheme
  }
})
/** The color of the stroke for the icons */
const strokeColor = computed(() => {
  return isDarkMode.value ? '#ff88b0' : '#c6005c'
})
/** Vue injectables */
provide('isDarkMode', isDarkMode)
provide('strokeColor', strokeColor)
/**
 * Vue lifecycle hooks
 */
/**  */
onMounted(() => {
  browser.extension
    .getViews()
    .map(view => {
      console.log(view)
      const isMobile = view.navigator.userAgent.match('Mobile')
      if (isMobile) {
        windowHeight.value = `${view.innerHeight!}px`
        windowWidth.value = `${view.innerWidth!}px`
      } else {
        windowHeight.value = '600px'
        windowWidth.value = '380px'
      }
    })
})
</script>

<template>
  <div class="popup-container w-full h-full bg-white dark:bg-gray-800 flex flex-col text-gray-800 dark:text-white">
    <MainLayout />
  </div>
</template>

<style lang="css">
.popup-container {
  min-width: v-bind(windowWidth);
  max-width: v-bind(windowWidth);
  min-height: v-bind(windowHeight);
  max-height: v-bind(windowHeight);
  overflow: hidden;
}
</style>
