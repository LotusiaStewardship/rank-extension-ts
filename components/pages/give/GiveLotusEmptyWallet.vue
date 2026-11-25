<script setup lang="ts">
import { LCard } from '@lotusia/ui'
</script>

<template>
  <div class="py-2 space-y-6">
    <!-- Main message -->
    <div>
      <p class="text-content">
        Your wallet is currently empty, but there are several ways to get Lotus:
      </p>
    </div>

    <!-- Cards with links -->
    <div class="py-2 flex flex-row gap-2 w-full">
      <!-- Mining Lotus Card -->
      <LCard as="a" href="https://burnlotus.org" target="_blank" rel="noopener noreferrer" interactive padding="sm"
        class="text-center flex-1 h-full w-full">
        <div class="text-3xl font-bold text-primary-text mb-2">
          ⛏️
        </div>
        <h3 class="text-lg font-semibold text-content mb-2">
          Mine Lotus
        </h3>
        <p class="text-sm text-content-muted mb-4">
          Convert electricity into Lotus
        </p>
      </LCard>

      <!-- Telegram Group Card -->
      <LCard as="a" href="https://t.me/LotusiaDiscourse" target="_blank" rel="noopener noreferrer" interactive
        padding="sm" class="text-center flex-1 h-full w-full">
        <div class="text-3xl font-bold text-primary-text mb-2">
          💬
        </div>
        <h3 class="text-lg font-semibold text-content mb-2">
          Join Community
        </h3>
        <p class="text-sm text-content-muted mb-4">
          Connect with other Lotus users
        </p>
      </LCard>
    </div>
  </div>
</template>
