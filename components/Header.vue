<script lang="ts" setup>
import logoUrl from '~/assets/Lotusia-Logo.png'

defineProps<{
  totalBalance: string
}>()
</script>

<template>
  <div class="flex h-10 items-center justify-between px-3 border-b border-border">
    <img :src="logoUrl" class="h-6 w-auto" alt="Lotusia" />
    <span
      class="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-foreground/80"
    >
      {{ toMinifiedNumber(totalBalance, 1_000_000) }}&nbsp;XPI
    </span>
  </div>
</template>
