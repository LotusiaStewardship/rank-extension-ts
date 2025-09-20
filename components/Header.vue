<script lang="ts" setup>
import { FwbImg } from 'flowbite-vue'
import logoUrl from '~/assets/Lotusia-Logo.png'
/**
 * Constants
 */
/** Properties defined on this component */
const props = defineProps<{
  totalBalance: string
}>()
</script>
<template>
  <div class="flex h-12 py-8 items-center">
    <div class="flex-grow absolute left-3">
      <fwb-img :src="logoUrl" size="w-36"></fwb-img>
    </div>
    <div class="flex-grow absolute right-0 balance">
      <span
        class="bg-gray-100 text-pink-600 text-md font-bold me-2 px-2.5 py-2 rounded dark:bg-gray-900 dark:text-pink-300">{{
          toMinifiedNumber(props.totalBalance, 1_000_000) }}&nbsp;XPI</span>
    </div>
  </div>
</template>
<style lang="css" scoped>
.left-3 {
  left: 0.75rem;
}

.top-2 {
  top: 0.5rem;
}

.balance {
  font-size: 1.25rem;
  font-weight: 700;
}

.balance-suffix {
  font-size: 0.8rem;
  font-weight: 700;
}
</style>
