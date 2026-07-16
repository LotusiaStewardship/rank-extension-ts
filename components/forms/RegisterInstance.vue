<script setup lang="ts">
import { Button } from '@/components/ui/button'
const emit = defineEmits(['register-instance'])
</script>

<template>
  <div class="space-y-3 py-2">
    <p class="text-sm text-foreground">
      Opt-in to the Lotusia Stewardship news bulletin and engagement rewards?
    </p>
    <div class="flex gap-2">
      <Button
        size="sm"
        variant="outline"
        class="flex-1 text-primary border-primary hover:bg-primary/10 dark:hover:bg-primary/20"
        @click="emit('register-instance', true)"
      >
        Yes, opt in
      </Button>
      <Button
        size="sm"
        variant="outline"
        class="flex-1 text-muted-foreground border-border hover:bg-accent hover:text-accent-foreground"
        @click="emit('register-instance', false)"
      >
        No, thanks
      </Button>
    </div>
  </div>
</template>
