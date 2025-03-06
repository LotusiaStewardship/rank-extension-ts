<script lang="ts" setup>
import { walletMessaging } from '@/entrypoints/background/messaging'

defineProps({})
const seedPhrase = shallowRef('')
const loadSeedPhrase = async () => {
  seedPhrase.value = await walletMessaging.sendMessage(
    'popup:loadSeedPhrase',
    undefined,
  )
}
const hideSeedPhrase = () => (seedPhrase.value = '')
</script>
<template>
  <!--
  <div class="col"><button type="button" class="btn">Receive</button></div>
  <div class="col"><button type="button" class="btn">Send</button></div>
  <div class="col"><button type="button" class="btn">Settings</button></div>
  -->
  <div>
    <button v-if="!seedPhrase" @click="loadSeedPhrase()" type="button">
      Reveal seed phrase
    </button>
    <button v-else-if="!!seedPhrase" @click="hideSeedPhrase()" type="button">
      Hide seed phrase
    </button>
  </div>
  <span style="height: 20px">{{ seedPhrase }}</span>
</template>
