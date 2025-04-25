<script lang="ts" setup>
import Header from '@/components/Header.vue'
import Footer from '@/components/Footer.vue'
import RegisterInstance from '@/components/forms/RegisterInstance.vue'
import Home from '@/components/pages/Home.vue'
import Receive from '@/components/pages/Receive.vue'
import Send from '@/components/pages/Send.vue'
import Settings from '@/components/pages/Settings.vue'
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
import { Unwatch } from 'wxt/storage'
import type { ShallowRef } from 'vue'

const walletBalance: ShallowRef<string, string> = shallowRef('')
const walletAddress: ShallowRef<string, string> = shallowRef('')
//const walletHistory: Ref<object, Record<string, string>> = ref({})
const registerStatus: ShallowRef<null, boolean> = shallowRef(null)
const registerPromptAck: ShallowRef<null, boolean> = shallowRef(null)
const setupComplete: ShallowRef<boolean, boolean> = shallowRef(false)
const renderComplete: ShallowRef<boolean, boolean> = shallowRef(false)
const watchers: Map<'balance' | 'address' | 'instance:optin', Unwatch> =
  new Map()

const beforeUnmount = () => {
  console.log('clean up, clean up')
  for (const [, unwatch] of watchers) {
    unwatch()
  }
}

const beforeMount = () => {
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
      newValue => (walletBalance.value = toXPI(newValue)),
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
    registerPromptAck.value = optin!
  })
}

const sendLotus = async (outAddress: string, outValue: number) => {
  walletMessaging.sendMessage('popup:sendLotus', {
    outAddress,
    outValue,
  })
}

const instanceRegistration = async (answer: boolean) => {
  registerPromptAck.value = answer
  const data = new Map<'signingKey' | 'instanceId', string>()
  data.set(
    'signingKey',
    await walletMessaging.sendMessage('popup:loadSigningKey', undefined),
  )
  data.set('instanceId', await instanceStore.getInstanceId())
  await instanceMessaging.sendMessage('popup:registerInstance', {
    optin: answer,
    signature: WalletTools.signMessage(
      data.get('instanceId')!,
      data.get('signingKey')!,
    ),
  })
  data.clear()
}

const walletSetup = async (seedPhrase?: string) => {
  beforeUnmount()
  setupComplete.value = false
  // if we don't have a seed phrase then create and send to background
  // background has no access to window.crypto so popup needs to generate
  const hasSeedPhrase = await walletStore.hasSeedPhrase()
  // request the ui wallet state from the background
  let walletState: UIWalletState
  // load existing walletState if not trying to import new one
  if (hasSeedPhrase && !seedPhrase) {
    walletState = await walletMessaging.sendMessage(
      'popup:loadWalletState',
      undefined,
    )
  }
  // use the provided seed phrase to generate walletState
  else if (seedPhrase) {
    walletState = await walletMessaging.sendMessage(
      'popup:seedPhrase',
      seedPhrase,
    )
  }
  // use new seed phrase to generate walletState
  else {
    const seedPhrase = WalletBuilder.newMnemonic().toString()
    walletState = await walletMessaging.sendMessage(
      'popup:seedPhrase',
      seedPhrase,
    )
  }

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
  <template v-if="setupComplete && registerPromptAck !== null">
    <div class="main container sm p-2">
      <Header :balance="walletBalance" />
      <Receive
        :address="walletAddress"
        :render-address-caption="renderComplete"
        @qr-mounted="renderComplete = true"
      />
      <Footer @import-seed-phrase="walletSetup" />
      extension registered:
      {{ registerStatus }}
    </div>
  </template>
  <template v-else-if="setupComplete && registerPromptAck === null">
    <RegisterInstance @register-instance="instanceRegistration" />
  </template>
  <template v-else> <div class="p-2">Loading wallet...</div> </template>
</template>

<style lang="css">
.main {
  min-width: 380px;
}
div {
  padding: 4px;
  place-items: center;
}
textarea {
  resize: none !important;
}
</style>
