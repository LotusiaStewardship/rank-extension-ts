<script setup lang="ts">
import { Button } from '@/components/ui/button'
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
      <Button @click="emit('register-instance', true)">Yes</Button>
    </div>
    <div class="block">
      <Button @click="emit('register-instance', false)">No</Button>
    </div>
  </div>
</template>
