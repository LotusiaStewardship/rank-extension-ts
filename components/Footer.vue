<script lang="ts" setup>
/** Vue components */
import FooterButton from '@/components/buttons/FooterButton.vue'
const emit = defineEmits(['active-page'])
</script>
<!--
  Vue template
-->
<template>
  <div class="flex items-center py-4">
    <!-- Home Button -->
    <div class="flex-grow text-center">
      <FooterButton @click="emit('active-page', 'home')" icon="home" />
    </div>
    <!-- Receive Lotus Button -->
    <div class="flex-grow text-center">
      <FooterButton @click="emit('active-page', 'receive')" icon="receive" />
    </div>
    <!-- Send Lotus Button -->
    <div class="flex-grow text-center">
      <FooterButton @click="emit('active-page', 'give')" icon="give" />
    </div>
    <!-- Settings Button -->
    <div class="flex-grow text-center">
      <FooterButton @click="emit('active-page', 'settings')" icon="settings" />
    </div>
  </div>
</template>
<!--
  Vue style
-->
<style lang="css"></style>
