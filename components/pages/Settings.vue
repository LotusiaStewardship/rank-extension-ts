<script setup lang="ts">
import SeedPhrase from '@/components/forms/settings/SeedPhrase.vue'
defineEmits<{
  'restore-seed-phrase': [string]
}>()
</script>
<template>
  <div class="py-2 px-6">
    <SeedPhrase @restore-seed-phrase="$emit('restore-seed-phrase', $event)" />
  </div>
</template>
<style lang="css" scoped></style>
