<script setup lang="ts">
import { FwbButton } from 'flowbite-vue'
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
      <FwbButton @click="emit('register-instance', true)">Yes</FwbButton>
    </div>
    <div class="block">
      <FwbButton @click="emit('register-instance', false)">No</FwbButton>
    </div>
  </div>
</template>
