<script setup lang="ts">
import HomeIcon from '@/components/icons/Home.vue'
import ReceiveIcon from '@/components/icons/Receive.vue'
import SendIcon from '@/components/icons/Send.vue'
import SettingsIcon from '@/components/icons/Settings.vue'
const props = defineProps<{
  icon: 'home' | 'receive' | 'give' | 'settings'
  color?: 'pink'
}>()
const color = shallowRef(props.color ?? 'pink')
</script>

<template>
  <button
    :class="`text-${color}-700 border border-${color}-700 hover:text-white focus:ring-2 focus:outline-none focus:ring-${color}-300 font-medium rounded-lg text-sm p-2.5 text-center inline-flex items-center me-2 dark:border-${color}-500 dark:text-${color}-500 dark:hover:text-white dark:focus:ring-${color}-800`"
  >
    <HomeIcon v-if="props.icon == 'home'" />
    <ReceiveIcon v-else-if="props.icon == 'receive'" />
    <SendIcon v-else-if="props.icon == 'give'" />
    <SettingsIcon v-else-if="props.icon == 'settings'" />
  </button>
</template>
