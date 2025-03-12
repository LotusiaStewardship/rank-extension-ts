<script lang="ts" setup>
import { walletMessaging } from '@/entrypoints/background/messaging'
import { WalletBuilder } from '@/entrypoints/background/modules/wallet'

const emit = defineEmits(['importSeedPhrase'])
const seedPhrase = shallowRef('')
const importSeedPhrase = shallowRef('')
const revealSeedPhrase = async () => {
  seedPhrase.value = await walletMessaging.sendMessage(
    'popup:loadSeedPhrase',
    undefined,
  )
}
const hideSeedPhrase = () => (seedPhrase.value = '')
const saveSeedPhrase = async () => {
  const seedPhrase = importSeedPhrase.value
  try {
    if (WalletBuilder.isValidSeedPhrase(seedPhrase)) {
      emit('importSeedPhrase', seedPhrase)
    }
  } catch (e) {
    console.warn(e)
  }
}
</script>
<template>
  <!--
  <div class="col"><button type="button" class="btn">Receive</button></div>
  <div class="col"><button type="button" class="btn">Send</button></div>
  <div class="col"><button type="button" class="btn">Settings</button></div>
  -->
  <div>
    <div class="padded">
      <textarea disabled rows="3" style="width: 100%" :value="seedPhrase" />
      <!-- <span style="height: 20px">{{ seedPhrase }}</span>-->
      <button v-if="!seedPhrase" @click="revealSeedPhrase" type="button">
        Reveal seed phrase
      </button>
      <button v-else-if="!!seedPhrase" @click="hideSeedPhrase" type="button">
        Hide seed phrase
      </button>
    </div>
    <hr />
    <div class="padded">
      <textarea
        rows="3"
        placeholder="Paste seed phrase here"
        style="width: 100%"
        v-model.trim="importSeedPhrase"
      />
      <button @click="saveSeedPhrase" type="button">Import seed phrase</button>
    </div>
  </div>
</template>
