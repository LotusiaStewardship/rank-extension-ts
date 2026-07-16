<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { TabsContent as TabsContentRoot } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
  tabValue: string
}>()
</script>

<template>
  <TabsContentRoot
    :value="tabValue"
    :class="
      cn(
        'mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        props.class,
      )
    "
  >
    <slot />
  </TabsContentRoot>
</template>
