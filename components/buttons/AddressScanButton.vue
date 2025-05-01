<script setup lang="ts">
import CameraIcon from '@/components/icons/Camera.vue'
const props = defineProps<{
  color?: 'pink'
}>()
const color = shallowRef(props.color ?? 'pink')
</script>
<template>
  <button
    :class="`text-${color}-700 border border-${color}-700 hover:text-white focus:ring-2 focus:outline-none focus:ring-${color}-300 font-medium rounded-lg text-sm p-1 text-center dark:border-${color}-500 dark:text-${color}-500 dark:hover:text-white dark:focus:ring-${color}-800`"
  >
    <CameraIcon />
  </button>
</template>
