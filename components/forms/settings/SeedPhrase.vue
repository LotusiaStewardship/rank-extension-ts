<script lang="ts" setup>
/** Modules and types */
import type { ShallowRef } from 'vue'
import { walletMessaging } from '@/entrypoints/background/messaging'
import { WalletBuilder } from '@/entrypoints/background/modules/wallet'
import {
  WALLET_BIP39_MIN_WORDS,
  WALLET_BIP39_MAX_WORDS,
} from '@/utils/constants'
import { FwbTextarea, FwbButton, FwbP } from 'flowbite-vue'
/**
 * Constants
 */
const existingSeedPhrase = shallowRef('')
const restoreSeedPhrase = shallowRef('')
//const emit = defineEmits(['import-seed-phrase'])
/**
 * Vue prop drilling
 */
/** */
const walletSeedPhrase = inject('wallet-seed-phrase') as ShallowRef<string>
/**
 * Functions
 */
/** */
async function toggleExistingSeedPhrase() {
  existingSeedPhrase.value = existingSeedPhrase.value
    ? ''
    : await walletMessaging.sendMessage('popup:loadSeedPhrase', undefined)
}
/** */
async function handleRestoreSeedPhrase() {
  if (isValidSeedPhrase(restoreSeedPhrase.value)) {
    // ancestor component watches changes to this value
    // only set this value when seed phrase is valid
    walletSeedPhrase.value = restoreSeedPhrase.value.trim()
    // reset form
    restoreSeedPhrase.value = ''
  }
}
/**
 * Validates user-provided seed phrase is valid and does not match
 * the existing seed phrase saved in the wallet
 * @param seedPhrase
 */
function isValidSeedPhrase(seedPhrase: string) {
  try {
    return (
      WalletBuilder.isValidSeedPhrase(seedPhrase) &&
      restoreSeedPhrase.value.split(' ').length >= WALLET_BIP39_MIN_WORDS &&
      restoreSeedPhrase.value.split(' ').length <= WALLET_BIP39_MAX_WORDS &&
      existingSeedPhrase.value !== restoreSeedPhrase.value
    )
  } catch (e) {
    console.warn(e)
    return false
  }
}
</script>
<!--
  Vue template
-->
<template>
  <div class="py-2">
    <fwb-textarea
      :rows="2"
      placeholder=""
      label="Reveal / Hide Wallet Password"
      v-model="existingSeedPhrase"
      readonly
    >
      <template #footer>
        <FwbP class="text-red-500 dark:text-red-300"
          >IMPORTANT: This password is your Lotus wallet. YOU CANNOT RECOVER
          THIS PASSWORD IF YOU LOSE IT. Keep it safe; memorize it. DO NOT share
          with anyone you would not trust with your bank account.
        </FwbP>
      </template>
    </fwb-textarea>
  </div>
  <div class="py-2">
    <fwb-button
      :outline="true"
      color="pink"
      size="sm"
      @click="toggleExistingSeedPhrase"
    >
      {{
        existingSeedPhrase ? 'Hide wallet password' : 'Reveal wallet password'
      }}
    </fwb-button>
  </div>
  <div class="py-2">
    <fwb-textarea
      :rows="2"
      placeholder="Input your wallet password here and click Restore Wallet"
      label="Restore Lotus Wallet"
      v-model="restoreSeedPhrase"
    >
    </fwb-textarea>
  </div>
  <div class="py-2">
    <fwb-button
      :disabled="!isValidSeedPhrase(restoreSeedPhrase)"
      :outline="true"
      color="pink"
      size="sm"
      @click="handleRestoreSeedPhrase"
      >Restore Wallet</fwb-button
    >
  </div>
</template>
<!--
  Vue style
-->
<style lang="css"></style>
