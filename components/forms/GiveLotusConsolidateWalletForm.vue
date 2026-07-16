<script setup lang="ts">
// Flowbite components removed
</script>

<template>
  <div class="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-2">
    <div class="flex items-start gap-2">
      <span class="text-amber-600 dark:text-amber-400 text-lg shrink-0 mt-0.5">⚠</span>
      <div>
        <p class="text-sm font-medium text-amber-800 dark:text-amber-300">
          Wallet consolidation required
        </p>
        <p class="text-sm text-amber-700 dark:text-amber-400 mt-1 leading-relaxed">
          Your wallet needs to be consolidated before you can give Lotus. This will
          combine all your UTXOs into a single address, reducing transaction fees
          and complexity.
        </p>
      </div>
    </div>
  </div>
</template>
