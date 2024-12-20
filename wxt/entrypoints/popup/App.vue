<script lang="ts" setup>
import { WalletManager, WalletBuilder } from '@/modules/wallet'
import { walletMessaging } from '@/entrypoints/background/messaging'
import { WalletState, walletStore } from '@/entrypoints/background/stores'
import { Unwatch } from 'wxt/storage'
import { ShallowRef } from 'vue'

const walletBalance = shallowRef()
const walletSeedPhrase = shallowRef()
const walletAddress = shallowRef()
const walletOutpoints = ref({})
const setupComplete = shallowRef(false)

const watchers: Map<keyof typeof walletStore.wxtStorageItems, Unwatch> =
  new Map()

const toAddress = (script: string | null) =>
  WalletBuilder.scriptFromString(script as string)?.toAddress()

onBeforeUnmount(() => {
  walletMessaging.removeAllListeners()
  for (const [, unwatch] of watchers) {
    unwatch()
  }
})

onMounted(async () => {
  // set up message listeners
  walletMessaging.onMessage('walletState', ({ data: walletState }) => {
    if (walletState) {
      walletSeedPhrase.value = walletState.seedPhrase
      walletAddress.value = toAddress(walletState.script)?.toXAddress()
      walletBalance.value = walletState.balance
      setupComplete.value = true
    }
  })
  // set up storage watchers
  watchers.set(
    'balance',
    walletStore.wxtStorageItems.balance.watch(
      newValue => (walletBalance.value = newValue),
    ),
  )
  // Load initial values
  const seedPhrase = await walletStore.wxtStorageItems.seedPhrase.getValue()
  console.log('initial seedPhrase', seedPhrase)
  if (!seedPhrase) {
    const mnemonic = WalletBuilder.newMnemonic()
    await walletMessaging.sendMessage('seedPhrase', mnemonic.toString())
    console.log('saved new mnemonic', `"${mnemonic.toString()}"`)
    walletSeedPhrase.value = mnemonic.toString()
  } else {
    await walletMessaging.sendMessage('loadWalletState', undefined)
  }
})
</script>

<template v-if="setupComplete">
  <div>{{ setupComplete }}</div>
  <div>Wallet address: {{ walletAddress }}</div>
  <div>Wallet balance: {{ walletBalance }}</div>
  <div>Seed Phrase: {{ walletSeedPhrase }}</div>
  <!--
  <div>
    <a href="https://wxt.dev" target="_blank">
      <img src="/wxt.svg" class="logo" alt="WXT logo" />
    </a>
    <a href="https://vuejs.org/" target="_blank">
      <img src="@/assets/vue.svg" class="logo vue" alt="Vue logo" />
    </a>
  </div><HelloWorld msg="WXT + Vue" />
  -->
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
