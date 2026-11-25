<script lang="ts" setup>
import { LApp } from '@lotusia/ui'
import MainLayout from '@/components/layouts/Main.vue'
/** Height of the popup window, in pixels */
const windowHeight = shallowRef('')
/** Width of the popup window, in pixels */
const windowWidth = shallowRef('')
/**
 * Vue lifecycle hooks
 */
/**  */
onMounted(() => {
  browser.extension
    .getViews()
    .map(view => {
      console.log(view)
      // @wxt-dev/browser types getViews() as a narrow Window without the DOM
      // members this sizing logic reads, so view the window through its DOM shape
      const domView = view as unknown as {
        navigator: { userAgent: string }
        innerHeight?: number
        innerWidth?: number
      }
      const isMobile = domView.navigator.userAgent.match('Mobile')
      if (isMobile) {
        windowHeight.value = `${domView.innerHeight!}px`
        windowWidth.value = `${domView.innerWidth!}px`
      } else {
        windowHeight.value = '600px'
        windowWidth.value = '380px'
      }
    })
})
</script>

<template>
  <LApp class="popup-container w-full h-full">
    <MainLayout />
  </LApp>
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
