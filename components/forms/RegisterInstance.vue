<script setup lang="ts">
const emit = defineEmits(['register-instance'])
</script>
<template>
  <div class="flex">
    <div class="block">
      <p>
        Opt-in to the Lotusia Stewardship news bulletin and engagement rewards?
      </p>
    </div>
  </div>
  <div class="flex">
    <div class="block">
      <button type="button"
        class="rounded-lg border border-border-strong px-3 py-1.5 text-sm font-medium text-primary-text transition-colors hover:bg-surface-sunken"
        @click="emit('register-instance', true)">Yes</button>
    </div>
    <div class="block">
      <button type="button"
        class="rounded-lg border border-border-strong px-3 py-1.5 text-sm font-medium text-primary-text transition-colors hover:bg-surface-sunken"
        @click="emit('register-instance', false)">No</button>
    </div>
  </div>
</template>
