<script setup lang="ts">
// Flowbite components removed
</script>

<template>
  <div class="py-2 space-y-6">
    <!-- Main message -->
    <div>
      <p class="dark:text-white">
        Your wallet is currently empty, but there are several ways to get Lotus:
      </p>
    </div>

    <!-- Cards with links -->
    <div class="py-2 flex flex-row gap-2 w-full">
      <!-- Mining Lotus Card -->
      <a href="https://burnlotus.org" target="_blank" class="block flex-1">
        <div class="text-center rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-2 hover:shadow-lg transition-shadow h-full w-full">
          <div class="p-2">
            <div class="text-3xl font-bold text-pink-500 dark:text-pink-300 mb-2">
              ⛏️
            </div>
            <h3 class="text-lg font-semibold text-gray-800 dark:text-white mb-2">
              Mine Lotus
            </h3>
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Convert electricity into Lotus
            </p>
          </div>
        </div>
      </a>

      <!-- Telegram Group Card -->
      <a href="https://t.me/LotusiaDiscourse" target="_blank" class="block flex-1">
        <div class="text-center rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-2 hover:shadow-lg transition-shadow h-full w-full">
          <div class="p-2">
            <div class="text-3xl font-bold text-blue-500 dark:text-blue-300 mb-2">
              💬
            </div>
            <h3 class="text-lg font-semibold text-gray-800 dark:text-white mb-2">
              Join Community
            </h3>
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Connect with other Lotus users
            </p>
          </div>
        </div>
      </a>
    </div>
  </div>
</template>