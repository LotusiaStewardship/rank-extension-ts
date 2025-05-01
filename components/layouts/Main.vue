<script setup lang="ts">
/** Vue components */
import Header from '@/components/Header.vue'
import Footer from '@/components/Footer.vue'
import HomePage from '@/components/pages/Home.vue'
import ReceiveLotusPage from '@/components/pages/ReceiveLotus.vue'
import SendLotusPage from '@/components/pages/GiveLotus.vue'
import SettingsPage from '@/components/pages/Settings.vue'
/** Modules and types */
import type { ShallowRef } from 'vue'
import {
  instanceMessaging,
  walletMessaging,
} from '@/entrypoints/background/messaging'
import {
  instanceStore,
  walletStore,
  type UIWalletState,
} from '@/entrypoints/background/stores'
import {
  WalletBuilder,
  WalletTools,
} from '@/entrypoints/background/modules/wallet'
import type { Unwatch as UnwatchFunction } from 'wxt/storage'
/**
 * Local types
 */
export type StorageWatcher = 'balance' | 'address' | 'instance:optin'
export type Page = 'home' | 'receive' | 'give' | 'settings'
/**
 * Constants
 */
/** Map of storage watchers */
const watchers: Map<StorageWatcher, UnwatchFunction> = new Map()
/** Current spendable Lotus balance */
const walletBalance: ShallowRef<string, string> = shallowRef('0')
/** Current Lotus address for send/receive/RANK */
const walletAddress: ShallowRef<string, string> = shallowRef('')
/** Prop-drill; this is ref contains seed phrase provided during import */
const importSeedPhrase = shallowRef('')
/** Current immature Lotus balance, i.e. mining outputs */
// TODO: discuss how mining rewards will be sent to extension users
//const walletBalanceImmature: ShallowRef<string, string> = shallowRef('')
/** Current status of extension registration with Lotusia Stewardship */
const registerStatus: ShallowRef<null, boolean> = shallowRef(null)
/** This is true if the `WalletManager` has been initialized with a mnemonic phrase */
const setupComplete: ShallowRef<boolean, boolean> = shallowRef(false)
/** Which page to display */
const activePage = shallowRef<Page>('home')
//const windowType = shallowRef('popup')
/** Height of the fixed footer component, in pixels */
const windowHeight = shallowRef('')
const windowWidth = shallowRef('')
const footerHeight = shallowRef(0)
const headerHeight = shallowRef(0)
/**
 * Vue prop drilling
 */
provide('import-seed-phrase', importSeedPhrase)
/**
 * Vue watchers
 */
watch(importSeedPhrase, async (seedPhrase, oldValue) => {
  // ignore change when textarea resets
  if (seedPhrase == '') {
    return
  }
  //
  await walletSetup(seedPhrase)
})
/**
 * Vue lifecycle hooks
 */
/**  */
// When operating in dev, this is triggered when saving changes to vue files
onBeforeUnmount(() => {
  console.log('clean up, clean up')
  unwatchStorage()
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
    walletStore.balanceStorageItem.watch(
      newValue => (walletBalance.value = newValue),
    ),
  )
  watchers.set(
    'instance:optin',
    instanceStore.optinStorageItem.watch(
      newValue => (registerStatus.value = newValue!),
    ),
  )
  instanceStore.getOptin().then(optin => {
    registerStatus.value = optin!
    //registerPromptAck.value = optin!
  })
  walletStore.balanceStorageItem
    .getValue()
    .then(balance => (walletBalance.value = balance))
  walletStore.addressStorageItem
    .getValue()
    .then(address => (walletAddress.value = address))
})
/**  */
onMounted(() => {
  walletSetup()
  headerHeight.value = document.getElementById('main-header')?.offsetHeight ?? 0
  footerHeight.value = document.getElementById('main-footer')?.offsetHeight ?? 0
  chrome.extension
    .getViews({
      type: 'popup',
    })
    .map(view => {
      view.chrome.windows.getCurrent().then(window => {
        console.log(window)
        // extension popup will be offset from browser
        if (
          (window.top! !== 0 && window.left! !== 0) ||
          window.state != 'normal'
        ) {
          windowHeight.value = '600px'
          windowWidth.value = '380px'
          //windowType.value = 'popup'
        } else {
          windowHeight.value = `${window.height!}px`
          windowWidth.value = `${window.width!}px`
          //windowType.value = 'normal'
        }
      })
    })
})
onUpdated(() => {
  console.log(`onUpdated()`)
})

/**
 * Functions
 */
/**
 *
 * @param page
 */
function setActivePage(page: Page) {
  activePage.value = page
}
/**  */
function unwatchStorage() {
  for (const [, unwatch] of watchers) {
    unwatch()
  }
}
/**
 *
 * @param seedPhrase
 */
async function walletSetup(seedPhrase?: string) {
  setupComplete.value = false
  // request the ui wallet state from the background
  let walletState: UIWalletState
  // use the provided seed phrase to generate walletState
  if (seedPhrase) {
    walletState = await walletMessaging.sendMessage(
      'popup:seedPhrase',
      seedPhrase,
    )
  }
  // If no seed phrase provided, check for existing seed and do setup
  // background has no access to window.crypto so popup needs to generate
  const hasSeedPhrase = await walletStore.hasSeedPhrase()
  // load existing walletState if not trying to import new one
  if (hasSeedPhrase) {
    walletState = await walletMessaging.sendMessage(
      'popup:loadWalletState',
      undefined,
    )
  }
  // generate new seed and build the wallet
  else {
    const seedPhrase = WalletBuilder.newMnemonic().toString()
    walletState = await walletMessaging.sendMessage(
      'popup:seedPhrase',
      seedPhrase,
    )
  }
  // set walletStore and reactive values
  await walletStore.setScriptPayload(walletState.scriptPayload)
  await walletStore.setScripthex(walletState.scriptHex)
  walletAddress.value = walletState.address
  walletBalance.value = walletState.balance
  // setup is done; load the main UI
  importSeedPhrase.value = ''
  setupComplete.value = true
}
</script>
<!--
  Vue template
-->
<template>
  <div :class="[`main`, 'w-full', 'h-full', 'container', 'dark:bg-gray-800']">
    <Header id="main-header" :balance="walletBalance" />
    <HomePage v-if="activePage === 'home'" />
    <ReceiveLotusPage
      :address="walletAddress"
      v-else-if="activePage == 'receive'"
    />
    <SendLotusPage :balance="walletBalance" v-else-if="activePage == 'give'" />
    <SettingsPage
      @import-seed-phrase="walletSetup"
      v-else-if="activePage == 'settings'"
    />
    <Footer id="main-footer" @active-page="setActivePage" />
  </div>
  <!-- 
  <template v-if="setupComplete">
  </template>
  <template v-else>
    <div class="p-6">Loading wallet...</div>
  </template>-->
</template>
<!--
  Vue style
-->
<style lang="css" scoped>
.main {
  min-width: v-bind(windowWidth);
  max-width: v-bind(windowWidth);
  min-height: v-bind(windowHeight);
  /* max-height: v-bind(windowHeight); */
}
/*
div {
  place-items: center;
}
*/
textarea {
  resize: none !important;
}
</style>
