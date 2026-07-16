<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { TabsTrigger as TabsTriggerRoot } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
  tabValue: string
  disabled?: boolean
}>()
</script>

<template>
  <TabsTriggerRoot
    :value="tabValue"
    :disabled="disabled"
    :class="
      cn(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow',
        props.class,
      )
    "
  >
    <slot />
  </TabsTriggerRoot>
</template>
