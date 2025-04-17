<script lang="ts" setup>
import Header from '@/components/Header.vue'
import Footer from '@/components/Footer.vue'
import Home from '@/components/pages/Home.vue'
import Receive from '@/components/pages/Receive.vue'
import Send from '@/components/pages/Send.vue'
import Settings from '@/components/pages/Settings.vue'
import { walletMessaging } from '@/entrypoints/background/messaging'
import { instanceStore, walletStore } from '@/entrypoints/background/stores'
import { WalletBuilder } from '@/entrypoints/background/modules/wallet'
import { Unwatch } from 'wxt/storage'
import type { ShallowRef } from 'vue'

const walletBalance: ShallowRef<string, string> = shallowRef('')
const walletAddress: ShallowRef<string, string> = shallowRef('')
//const walletHistory: Ref<object, Record<string, string>> = ref({})
const setupComplete: ShallowRef<boolean, boolean> = shallowRef(false)
const renderComplete: ShallowRef<boolean, boolean> = shallowRef(false)
const watchers: Map<'balance' | 'address', Unwatch> = new Map()

const beforeUnmount = () => {
  console.log('clean up, clean up')
  for (const [, unwatch] of watchers) {
    unwatch()
  }
}

const beforeMount = () => {
  console.log('before mount')
  // write the platform OS to instanceStore
  browser.runtime.getPlatformInfo().then(async platformInfo => {
    await instanceStore.setOs(platformInfo.os)
  })
  // set up storage watchers
  watchers.set(
    'balance',
    walletStore.balanceStorageItem.watch(
      newValue => (walletBalance.value = toXPI(newValue)),
    ),
  )
}

const sendLotus = async (outAddress: string, outValue: number) => {
  walletMessaging.sendMessage('popup:sendLotus', {
    outAddress,
    outValue,
  })
}

const walletSetup = async (seedPhrase?: string) => {
  beforeUnmount()
  setupComplete.value = false
  // if we don't have a seed phrase then create and send to background
  // background has no access to window.crypto so popup needs to generate
  const hasSeedPhrase = await walletStore.hasSeedPhrase()
  // request the ui wallet state from the background
  const walletState =
    hasSeedPhrase && !seedPhrase
      ? await walletMessaging.sendMessage('popup:loadWalletState', undefined)
      : await walletMessaging.sendMessage(
          'popup:seedPhrase',
          // use the imported seed phrase if avail, else generate new
          seedPhrase ?? WalletBuilder.newMnemonic().toString(),
        )
  await walletStore.setScriptPayload(walletState.scriptPayload)
  await walletStore.setScripthex(walletState.scriptHex)
  walletAddress.value = walletState.address
  walletBalance.value = toXPI(walletState.balance)

  beforeMount()
  setupComplete.value = true
}

// Probably won't need this? vuejs doesn't detect when the extension
// popup is closed, so this event never triggers
// When operating in dev, this is triggered when saving changes to vue files
onBeforeUnmount(beforeUnmount)
onBeforeMount(beforeMount)
onMounted(walletSetup)
</script>

<template>
  <div class="container sm p-4">
    <template v-if="setupComplete">
      <Header :balance="walletBalance" />
      <Receive
        :address="walletAddress"
        :render-address-caption="renderComplete"
        @qr-mounted="renderComplete = true"
      />
      <Footer @import-seed-phrase="walletSetup" />
    </template>
    <template v-else> Please wait... </template>
  </div>
</template>

<style lang="css">
div {
  place-items: center;
}
textarea {
  resize: none !important;
}
</style>
