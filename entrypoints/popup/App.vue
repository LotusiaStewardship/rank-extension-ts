<script lang="ts" setup>
import MainLayout from '@/components/layouts/Main.vue'
/** Height of the popup window, in pixels */
const windowHeight = shallowRef('')
/** Width of the popup window, in pixels */
const windowWidth = shallowRef('')

onMounted(() => {
  browser.extension
    .getViews({
      type: 'popup',
    })
    .map(view => {
      view.chrome.windows.getCurrent().then(window => {
        console.log(window)
        const isMobile = view.navigator.userAgent.match('Mobile')
        if (isMobile) {
          windowHeight.value = `${window.height!}px`
          windowWidth.value = `${window.width!}px`
        } else {
          windowHeight.value = '600px'
          windowWidth.value = '380px'
        }
      })
    })
})
</script>

<template>
  <div class="popup-container w-full h-full bg-gray-200 dark:bg-gray-800 flex flex-col">
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
