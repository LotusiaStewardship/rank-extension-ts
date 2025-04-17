<script lang="ts" setup>
import { walletMessaging } from '@/entrypoints/background/messaging'
import { WalletBuilder } from '@/entrypoints/background/modules/wallet'
import { FwbTextarea, FwbButton, FwbTab, FwbTabs } from 'flowbite-vue'

const activeTab = ref('show-hide')
const seedPhrase = shallowRef('')
const importSeedPhrase = shallowRef('')
const emit = defineEmits(['import-seed-phrase'])
const showHideSeedPhrase = async () => {
  seedPhrase.value = seedPhrase.value
    ? ''
    : await walletMessaging.sendMessage('popup:loadSeedPhrase', undefined)
}
const saveSeedPhrase = async () => {
  const seedPhrase = importSeedPhrase.value
  try {
    if (WalletBuilder.isValidSeedPhrase(seedPhrase)) {
      emit('import-seed-phrase', seedPhrase)
    }
  } catch (e) {
    console.warn(e)
  }
}
</script>
<template>
  <fwb-tabs v-model="activeTab" variant="underline">
    <fwb-tab name="show-hide" title="Show / Hide">
      <fwb-textarea
        :rows="3"
        placeholder=""
        label="Show / Hide Seed Phrase"
        v-model="seedPhrase"
        disabled
      />
      <!-- <span style="height: 20px">{{ seedPhrase }}</span>-->
      <fwb-button color="alternative" size="xs" @click="showHideSeedPhrase">
        {{ seedPhrase ? 'Hide' : 'Show' }}
      </fwb-button>
    </fwb-tab>
    <fwb-tab name="import" title="Import">
      <fwb-textarea
        :rows="3"
        placeholder=""
        label="Import Seed Phrase"
        v-model.trim="importSeedPhrase"
      />
      <fwb-button color="alternative" size="xs" @click="saveSeedPhrase"
        >&nbsp;&nbsp;OK&nbsp;&nbsp;</fwb-button
      >
    </fwb-tab>
  </fwb-tabs>
</template>

<style lang="css"></style>
