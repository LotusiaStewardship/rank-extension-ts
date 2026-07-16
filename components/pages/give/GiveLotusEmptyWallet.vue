<script setup lang="ts">
// Flowbite components removed
</script>

<template>
  <div class="py-2 space-y-4">
    <!-- Main message -->
    <div>
      <p class="text-sm text-muted-foreground">
        Your wallet is currently empty, but there are several ways to get Lotus:
      </p>
    </div>

    <!-- Cards with links -->
    <div class="flex flex-row gap-2 w-full">
      <!-- Mining Lotus Card -->
      <a href="https://burnlotus.org" target="_blank" class="block flex-1">
        <div class="text-center rounded-xl border border-border bg-card text-card-foreground p-3 hover:shadow-elevation-3 transition-shadow h-full w-full">
          <div class="text-4xl mb-2">⛏️</div>
          <h3 class="text-base font-semibold text-card-foreground mb-1">
            Mine Lotus
          </h3>
          <p class="text-sm text-muted-foreground leading-relaxed">
            Convert electricity into Lotus
          </p>
        </div>
      </a>

      <!-- Telegram Group Card -->
      <a href="https://t.me/LotusiaDiscourse" target="_blank" class="block flex-1">
        <div class="text-center rounded-xl border border-border bg-card text-card-foreground p-3 hover:shadow-elevation-3 transition-shadow h-full w-full">
          <div class="text-4xl mb-2">💬</div>
          <h3 class="text-base font-semibold text-card-foreground mb-1">
            Join Community
          </h3>
          <p class="text-sm text-muted-foreground leading-relaxed">
            Connect with other Lotus users
          </p>
        </div>
      </a>
    </div>
  </div>
</template>
