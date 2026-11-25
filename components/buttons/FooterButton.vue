<script setup lang="ts">
import HomeIcon from '@/components/icons/Home.vue'
import ReceiveIcon from '@/components/icons/Receive.vue'
import SendIcon from '@/components/icons/Send.vue'
import SettingsIcon from '@/components/icons/Settings.vue'
/** Vue definitions */
const { icon } = defineProps<{
  icon: 'home' | 'receive' | 'give' | 'settings'
}>()
</script>

<template>
  <button
    class="border border-border-strong text-primary-text rounded-lg font-medium text-sm p-2.5 text-center inline-flex items-center me-2 transition-colors hover:bg-surface-sunken">
    <HomeIcon v-if="icon == 'home'" />
    <ReceiveIcon v-else-if="icon == 'receive'" />
    <SendIcon v-else-if="icon == 'give'" />
    <SettingsIcon v-else-if="icon == 'settings'" />
  </button>
</template>
