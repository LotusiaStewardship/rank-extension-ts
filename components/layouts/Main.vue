<script setup lang="ts">
/** Vue components */
import Header from '@/components/Header.vue'
import Footer from '@/components/Footer.vue'
import HomePage from '@/components/pages/Home.vue'
import ReceiveLotusPage from '@/components/pages/ReceiveLotus.vue'
import GiveLotusPage from '@/components/pages/GiveLotus.vue'
import SettingsPage from '@/components/pages/Settings.vue'
import { FwbSpinner } from 'flowbite-vue'
/** Types */
import type { Unwatch as UnwatchFunction } from 'wxt/storage'
import type { ChainState, UIWalletState } from '@/entrypoints/background/stores/wallet'
/** Modules and types */
import {
  walletMessaging,
} from '@/entrypoints/background/messaging'
import {
  WalletBalance,
  walletStore,
} from '@/entrypoints/background/stores/wallet'
import {
  WalletBuilder,
} from '@/entrypoints/background/modules/wallet'
/**
 * Local types
 */
export type StorageWatcher =
  | 'balance'
  | 'tipHeight'
  | 'tipHash'
export type Page = 'home' | 'receive' | 'give' | 'settings'
/**
 * Constants
 */
/** Map of storage watchers */
const watchers: Map<StorageWatcher, UnwatchFunction> = new Map()
/** Current spendable Lotus balance */
const walletBalance = ref<WalletBalance>({
  total: '0',
  spendable: '0',
})
/** Current chain state */
const chainState = ref<ChainState>({
  tipHeight: 0,
  tipHash: '',
})
/** Current Lotus address for send/receive/RANK */
const walletAddress = shallowRef('')
/** Current Lotus scriptPayload for API calls */
const walletScriptPayload = shallowRef('')
/** Which page to display */
const activePage = shallowRef<Page>('home')
//const windowType = shallowRef('popup')
/**
 * Vew computed properties
 */
/** This is true to indicate that all required runtime values have been initialized */
const initialized = computed(() =>
  walletAddress.value &&
  walletBalance.value &&
  walletScriptPayload.value &&
  chainState.value.tipHeight &&
  chainState.value.tipHash
)
/**
 * Vue prop drilling
 */
provide('wallet-script-payload', walletScriptPayload)
provide('chain-state', chainState)
/**
 * Vue lifecycle hooks
 */
/**  */
// When operating in dev, this is triggered when saving changes to vue files
onBeforeUnmount(() => {
  console.log('clean up, clean up')
  // clean up storage watchers  
  watchers.forEach(unwatch => unwatch())
})
/**  */
onBeforeMount(() => {
  console.log('before mount')
  // write the platform OS to instanceStore
  /*
  browser.runtime.getPlatformInfo().then(async platformInfo => {
    await instanceStore.setOs(platformInfo.os)
  })
  */
  // set up storage watchers
  watchers.set(
    'balance',
    walletStore.balanceStorageItem.watch(newValue => (walletBalance.value = newValue as WalletBalance)),
  )
  watchers.set(
    'tipHeight',
    walletStore.tipHeightStorageItem.watch(newValue => (chainState.value.tipHeight = newValue as number)),
  )
  watchers.set(
    'tipHash',
    walletStore.tipHashStorageItem.watch(newValue => (chainState.value.tipHash = newValue as string)),
  )
})
/**  */
onMounted(() => {
  walletSetup()
})

/**
 * Functions
 */
/**
 * Initializes the wallet by either using the provided seed phrase or generating a new one.
 * @param seedPhrase The optional seed phrase to use for wallet setup
 */
async function walletSetup(seedPhrase?: string) {
  // If we are already initialized, clear the values
  if (initialized.value) {
    walletAddress.value = ''
    walletBalance.value = {
      total: '0',
      spendable: '0',
    }
    walletScriptPayload.value = ''
  }
  // request the ui wallet state from the background
  let walletState: UIWalletState
  // use the provided seed phrase to generate new walletState
  // apply this new walletState and return
  if (seedPhrase) {
    walletState = await walletMessaging.sendMessage(
      'popup:seedPhrase',
      seedPhrase,
    )
    return initialize(walletState)
  }
  // check for existing seed phrase
  const hasSeedPhrase = await walletStore.hasSeedPhrase()
  // if no seed phrase, generate new seed and build walletState
  // apply this new walletState and return
  if (!hasSeedPhrase) {
    seedPhrase = WalletBuilder.newMnemonic().toString() as string
    walletState = await walletMessaging.sendMessage(
      'popup:seedPhrase',
      seedPhrase,
    )
    return initialize(walletState)
  }
  // load and apply existing walletState and return
  walletState = await walletMessaging.sendMessage(
    'popup:loadWalletState',
    undefined,
  )
  return initialize(walletState)
}
/**
 * Applies the provided wallet state to the Vue refs for runtime operation
 * @param walletState The wallet state containing script, address and balance info
 */
async function initialize(walletState: UIWalletState) {
  // load necessary storage values
  const tipHeight = await walletStore.tipHeightStorageItem.getValue() as number
  const tipHash = await walletStore.tipHashStorageItem.getValue() as string
  chainState.value = { tipHeight, tipHash }
  // update reactive values with walletState
  walletAddress.value = walletState.address
  walletBalance.value = walletState.balance
  walletScriptPayload.value = walletState.scriptPayload
}
</script>
<!--
  Vue template
-->
<template>

  <header class="flex-shrink-0">
    <Header :total-balance="walletBalance.total" />
  </header>
  <main class="grow overflow-y-auto hidden-scrollbar">
    <template v-if="initialized">
      <div class="container mt-12 mb-12">
        <HomePage v-if="activePage === 'home'" />
        <ReceiveLotusPage :address="walletAddress" v-else-if="activePage == 'receive'" />
        <GiveLotusPage :spendable-balance="walletBalance.spendable" v-else-if="activePage == 'give'" />
        <SettingsPage @restore-seed-phrase="walletSetup" v-else-if="activePage == 'settings'" />
      </div>
    </template>
    <template v-else>
      <div class="flex justify-center items-center py-4">
        <FwbSpinner size="8" />
        <span class="font-medium text-xl text-gray-300 dark:text-gray-500 ml-2">Initializing...</span>
      </div>
    </template>
  </main>
  <footer class="flex-shrink-0">
    <Footer @active-page="activePage = $event" />
  </footer>
</template>
<!--
  Vue style
-->
<style lang="css">
.hidden-scrollbar {
  scrollbar-width: none;
}

.hidden-scrollbar::-webkit-scrollbar {
  display: none;
}

textarea {
  resize: none !important;
}
</style>
