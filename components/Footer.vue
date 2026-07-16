<script setup lang="ts">
import FooterButton from '@/components/buttons/FooterButton.vue'

defineProps<{
  activePage: 'home' | 'receive' | 'give' | 'settings'
}>()

const emit = defineEmits<{
  'active-page': [page: 'home' | 'receive' | 'give' | 'settings']
}>()
</script>

<template>
  <nav class="flex items-center justify-center gap-1 py-2 px-2 border-t border-border bg-background">
    <FooterButton
      icon="home"
      :active="activePage === 'home'"
      @click="emit('active-page', 'home')"
    />
    <FooterButton
      icon="receive"
      :active="activePage === 'receive'"
      @click="emit('active-page', 'receive')"
    />
    <FooterButton
      icon="give"
      :active="activePage === 'give'"
      @click="emit('active-page', 'give')"
    />
    <FooterButton
      icon="settings"
      :active="activePage === 'settings'"
      @click="emit('active-page', 'settings')"
    />
  </nav>
</template>
