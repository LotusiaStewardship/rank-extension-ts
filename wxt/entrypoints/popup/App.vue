<script lang="ts" setup>
import { walletMessaging } from '@/entrypoints/background/messaging'
import { walletStore } from '@/entrypoints/background/stores'
import { Unwatch } from 'wxt/storage'
import { toXPI } from '@/utils/functions'
import { ShallowRef } from 'vue'

const walletBalance: ShallowRef<string, string> = shallowRef('')
const walletSeedPhrase: ShallowRef<unknown, string> = shallowRef()
const walletAddress: ShallowRef<string, string> = shallowRef('')
const walletHistory: Ref<object, Record<string, string>> = ref({})
const setupComplete: ShallowRef<boolean, boolean> = shallowRef(false)

const watchers: Map<keyof typeof walletStore.wxtStorageItems, Unwatch> =
  new Map()

const sendLotus = async (outAddress: string, outValue: number) => {
  walletMessaging.sendMessage('popup:sendLotus', {
    outAddress,
    outValue,
  })
}

// Probably won't need this? vuejs doesn't detect when the extension
// popup is closed, so this event never triggers
// When operating in dev, this is triggered when saving changes to vue files
onBeforeUnmount(() => {
  console.log('clean up, clean up')
  walletMessaging.removeAllListeners()
  for (const [, unwatch] of watchers) {
    unwatch()
  }
})

onBeforeMount(() => {
  console.log('before mount')
  // set up message listeners
  walletMessaging.onMessage(
    'background:walletState',
    ({ data: walletState }) => {
      walletAddress.value = walletState.address
      walletBalance.value = toXPI(walletState.balance)
      setupComplete.value = true
    },
  )
  // set up storage watchers
  watchers.set(
    'balance',
    walletStore.wxtStorageItems.balance.watch(
      newValue => (walletBalance.value = toXPI(newValue as string)),
    ),
  )
  // load the required wallet data from background localStorage
  walletMessaging.sendMessage('popup:loadWalletState', undefined)
})
</script>

<template>
  <template v-if="setupComplete">
    <div>Wallet address: {{ walletAddress }}</div>
    <div>Wallet balance: {{ walletBalance }} Lotus</div>
    <div>Seed Phrase: {{ walletSeedPhrase }}</div>
    <button
      @click="
        sendLotus('lotus_16PSJNGxAvexzhaZDvx9sbm6hJ6MJLaszhnta3txA', 1_569_700)
      "
    >
      Send Lotus
    </button>
  </template>
  <template v-else>
    <div>Please wait...</div>
  </template>
  <!--
  <div>
    <a href="https://wxt.dev" target="_blank">
      <img src="/wxt.svg" class="logo" alt="WXT logo" />
    </a>
    <a href="https://vuejs.org/" target="_blank">
      <img src="@/assets/vue.svg" class="logo vue" alt="Vue logo" />
    </a>
  </div>
  <HelloWorld msg="WXT + Vue" />
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
