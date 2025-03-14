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
//const walletSeedPhrase: ShallowRef<unknown, string> = shallowRef()
//const walletHistory: Ref<object, Record<string, string>> = ref({})
const setupComplete: ShallowRef<boolean, boolean> = shallowRef(false)
const renderComplete: ShallowRef<boolean, boolean> = shallowRef(false)

const watchers: Map<'balance' | 'address', Unwatch> = new Map()

const sendLotus = async (outAddress: string, outValue: number) => {
  walletMessaging.sendMessage('popup:sendLotus', {
    outAddress,
    outValue,
  })
}

const walletSetup = async (seedPhrase?: string) => {
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
  setupComplete.value = true
}

// Probably won't need this? vuejs doesn't detect when the extension
// popup is closed, so this event never triggers
// When operating in dev, this is triggered when saving changes to vue files
onBeforeUnmount(() => {
  console.log('clean up, clean up')
  for (const [, unwatch] of watchers) {
    unwatch()
  }
})

onBeforeMount(() => {
  console.log('before mount')
  // write the platform OS to instanceStore
  browser.runtime.getPlatformInfo().then(async platformInfo => {
    await instanceStore.setOs(platformInfo.os)
  })
  instanceStore.getInstanceId().then(async instanceId => {
    if (!instanceId) {
      // Create new instanceId before creating new wallet
      instanceId = await newInstanceId(browser.runtime.id)
      await instanceStore.setInstanceId(instanceId)
    }
  })
  // set up storage watchers
  watchers.set(
    'balance',
    walletStore.balanceStorageItem.watch(
      newValue => (walletBalance.value = toXPI(newValue)),
    ),
  )
})

const onQrMounted = () => {
  renderComplete.value = true
}

onMounted(walletSetup)
</script>

<template>
  <template v-if="setupComplete">
    <Header :balance="walletBalance" />
    <Receive
      :address="walletAddress"
      :render-address-caption="renderComplete"
      @qr-mounted="onQrMounted"
    />
    <Footer @importSeedPhrase="walletSetup" />
  </template>
  <template v-else>
    <div>Please wait...</div>
  </template>
</template>

<style scoped>
.logo {
  height: 6em;
  padding: 1.5em;
  will-change: filter;
  transition: filter 300ms;
}
.logo:hover {
  filter: drop-shadow(0 0 2em #54bc4ae0);
}
.logo.vue:hover {
  filter: drop-shadow(0 0 2em #42b883aa);
}
</style>
