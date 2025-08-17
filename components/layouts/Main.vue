<script setup lang="ts">
/** Vue components */
import Header from '@/components/Header.vue'
import Footer from '@/components/Footer.vue'
import HomePage from '@/components/pages/Home.vue'
import ReceiveLotusPage from '@/components/pages/ReceiveLotus.vue'
import GiveLotusPage from '@/components/pages/GiveLotus.vue'
import SettingsPage from '@/components/pages/Settings.vue'
import LoadingSpinnerMessage from '@/components/LoadingSpinnerMessage.vue'
/** Types */
import type { Unwatch as UnwatchFunction } from 'wxt/storage'
import type { UIWalletState } from '@/entrypoints/background/stores/wallet'
/** Modules */
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
export type StorageWatcher = 'balance'
export type Page = 'home' | 'receive' | 'give' | 'settings'
/**
 * Constants
 */
const { sendMessage } = walletMessaging
/** Map of storage watchers */
const watchers: Map<StorageWatcher, UnwatchFunction> = new Map()
/** Current spendable Lotus balance */
const walletBalance = ref<WalletBalance>({
  total: '0',
  spendable: '0',
})
/** Current Lotus address for send/receive/RANK */
const walletAddress = shallowRef('')
/** Current Lotus scriptPayload for API calls */
const walletScriptPayload = shallowRef('')
/** Whether the wallet needs to be defragmented */
const walletNeedsDefrag = shallowRef(true)
/** Loading message */
const loadingMessage = shallowRef('Initializing...')
/** Which page to display */
const activePage = shallowRef<Page>('home')
/**
 * Vew computed properties
 */
/** This is true to indicate that all required runtime values have been initialized */
const initialized = computed(() =>
  walletAddress.value &&
  walletBalance.value &&
  walletScriptPayload.value &&
  !walletNeedsDefrag.value
)
/**
 * Vue prop drilling
 */
provide('wallet-script-payload', walletScriptPayload)
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
})
/**  */
onMounted(initialize)

/**
 * Functions
 */
/**
 * Initializes the wallet by either using the provided seed phrase or generating a new one.
 * @param seedPhrase The optional seed phrase to use for wallet setup
 */
async function getWalletState(seedPhrase?: string): Promise<UIWalletState> {
  // use the provided seed phrase to generate new walletState
  if (seedPhrase) {
    return await sendMessage(
      'popup:initializeWallet',
      seedPhrase,
    )
  }
  // check for existing seed phrase
  const hasSeedPhrase = await walletStore.hasSeedPhrase()
  // if no seed phrase, generate new seed and build walletState
  if (!hasSeedPhrase) {
    return await sendMessage(
      'popup:initializeWallet',
      WalletBuilder.newMnemonic().toString() as string,
    )
  }
  // load and return existing walletState
  return await sendMessage(
    'popup:loadWalletState',
    undefined,
  )
}
/**
 * Applies the provided wallet state to the Vue refs for runtime operation
 * @param walletState The wallet state containing script, address and balance info
 */
async function initialize(seedPhrase?: string): Promise<void> {
  // If we are already initialized, clear the values
  if (initialized.value) {
    walletScriptPayload.value = ''
    walletAddress.value = ''
    walletBalance.value = {
      total: '0',
      spendable: '0',
    }
    // set the active page to home
    activePage.value = 'home'
  }
  const walletState = await getWalletState(seedPhrase)
  // ask the wallet if UTXO consolidation is needed
  // Repeat until the wallet is sufficiently defragmented
  while (await sendMessage(
    'popup:needsUtxoConsolidation',
    undefined,
  )) {
    loadingMessage.value = 'Defragmenting wallet...'
    const txids = await sendMessage('popup:defragWallet', undefined)
    console.log('UTXO set has been consolidated in the following transactions:', txids)
  }
  // update reactive values to complete initialization
  walletNeedsDefrag.value = false
  walletAddress.value = walletState.address
  walletBalance.value = walletState.balance
  walletScriptPayload.value = walletState.scriptPayload
}
</script>
<!--
  Vue template
-->
<template>

  <header class="shrink-0">
    <Header :total-balance="walletBalance.total" />
  </header>
  <main class="grow overflow-y-auto hidden-scrollbar">
    <LoadingSpinnerMessage v-if="!initialized" :message="loadingMessage" />
    <template v-else>
      <div class="container">
        <HomePage v-if="activePage === 'home'" />
        <ReceiveLotusPage :address="walletAddress" v-else-if="activePage == 'receive'" />
        <GiveLotusPage :spendable-balance="walletBalance.spendable" v-else-if="activePage == 'give'" />
        <SettingsPage @restore-seed-phrase="initialize" v-else-if="activePage == 'settings'" />
      </div>
    </template>
  </main>
  <footer class="shrink-0">
    <Footer v-show="initialized" @active-page="activePage = $event" />
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
