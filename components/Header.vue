<script lang="ts" setup>
import logoUrl from '~/assets/Lotusia-Logo.png'

defineProps<{
  totalBalance: string
}>()
</script>

<template>
  <div class="flex h-12 py-8 items-center">
    <div class="flex-grow absolute left-3">
      <img :src="logoUrl" class="w-36" alt="Lotusia Logo" />
    </div>
    <div class="flex-grow absolute right-0 balance">
      <span
        class="bg-gray-100 text-pink-600 text-md font-bold me-2 px-2.5 py-2 rounded dark:bg-gray-900 dark:text-pink-300">{{
          toMinifiedNumber(totalBalance, 1_000_000) }}&nbsp;XPI</span>
    </div>
  </div>
</template>
