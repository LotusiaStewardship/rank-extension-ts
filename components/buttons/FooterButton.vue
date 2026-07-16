<script setup lang="ts">
import { Home, ArrowDownToLine, ArrowUpFromLine, Settings } from 'lucide-vue-next'
import { computed } from 'vue'

const props = defineProps<{
  icon: 'home' | 'receive' | 'give' | 'settings'
  active?: boolean
}>()

const emit = defineEmits<{
  click: []
}>()

const iconComponent = computed(() => {
  switch (props.icon) {
    case 'home': return Home
    case 'receive': return ArrowDownToLine
    case 'give': return ArrowUpFromLine
    case 'settings': return Settings
    default: return Home
  }
})
</script>

<template>
  <button
    class="relative flex flex-col items-center justify-center gap-0.5 w-12 h-10 rounded-lg transition-colors duration-150 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
    @click="emit('click')"
  >
    <Component
      :is="iconComponent"
      :size="22"
      :stroke-width="active ? 2.5 : 1.8"
      :class="active ? 'text-primary' : 'text-muted-foreground'"
    />
    <!-- Active indicator dot -->
    <span
      v-if="active"
      class="absolute bottom-0.5 w-1 h-1 rounded-full bg-primary"
    />
  </button>
</template>
