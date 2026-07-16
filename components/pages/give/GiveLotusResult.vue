<script setup lang="ts">
import { CheckCircle, XCircle, X } from 'lucide-vue-next'
import { DEFAULT_EXPLORER_URL } from '@/utils/constants'

const props = defineProps<{
  txid: string | null
  error: string | null
}>()

const emit = defineEmits<{
  reset: []
}>()
</script>

<template>
  <div class="py-2">
    <template v-if="txid">
      <div
        class="flex items-start gap-3 p-3 rounded-lg border bg-primary/5 border-primary/20 text-sm"
        role="alert"
      >
        <CheckCircle class="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div class="flex-1 min-w-0">
          <p class="font-medium text-foreground">Lotus given successfully!</p>
          <p class="mt-0.5 text-muted-foreground">
            <a
              :href="DEFAULT_EXPLORER_URL + '/tx/' + txid"
              target="_blank"
              class="text-primary hover:text-primary/80 underline underline-offset-2"
            >
              View transaction details
            </a>
          </p>
        </div>
        <button
          type="button"
          class="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-primary/10 hover:text-foreground transition-colors"
          @click="emit('reset')"
          aria-label="Dismiss"
        >
          <X class="h-4 w-4" />
        </button>
      </div>
    </template>
    <template v-else-if="error">
      <div
        class="flex items-start gap-3 p-3 rounded-lg border bg-destructive/5 border-destructive/20 text-sm"
        role="alert"
      >
        <XCircle class="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div class="flex-1 min-w-0">
          <p class="font-medium text-foreground">Transaction failed</p>
          <p class="mt-0.5 text-muted-foreground break-words">{{ error }}</p>
        </div>
        <button
          type="button"
          class="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          @click="emit('reset')"
          aria-label="Dismiss"
        >
          <X class="h-4 w-4" />
        </button>
      </div>
    </template>
  </div>
</template>
