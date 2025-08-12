<script setup lang="ts">
import { FwbP } from 'flowbite-vue'
</script>

<template>
  <div class="py-2 flex">
    <div class="flex-grow">
      <FwbP class="text-yellow-600 dark:text-yellow-300">
        IMPORTANT: Your wallet needs to be consolidated before you can give Lotus.
      </FwbP>
      <FwbP>
        This will consolidate your wallet by sending all your UTXOs to a single
        address. This will reduce the number of transactions and fees when you
        give Lotus. You can do this by clicking the button below.
      </FwbP>
    </div>
  </div>
</template>

<style scoped></style>