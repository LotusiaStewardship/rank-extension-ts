<script lang="ts" setup>
/** Modules and types */
import { walletMessaging } from '@/entrypoints/background/messaging'
import { WalletBuilder } from '@/entrypoints/background/modules/wallet'
import {
  WALLET_BIP39_MIN_WORDS,
  WALLET_BIP39_MAX_WORDS,
} from '@/utils/constants'
import { FwbTextarea, FwbButton, FwbP } from 'flowbite-vue'
/**
 * Vue component definitions
 */
const emit = defineEmits<{
  'restore-seed-phrase': [string]
}>()
/**
 * Vue refs
 */
const existingSeedPhrase = shallowRef('')
const restoreSeedPhrase = shallowRef('')
const overwriteSeedPhrase = shallowRef(false)
/**
 * Vue computed properties
 */
const isRestoreFormDataValid = computed(() => {
  return isRestoreSeedPhraseValid.value && overwriteSeedPhrase.value
})
const isRestoreSeedPhraseValid = computed(() => validateSeedPhrase(restoreSeedPhrase.value))
/**
 * Functions
 */
/**
/**
 * Toggles the display of the existing wallet seed phrase.
 * If the seed phrase is currently shown, it hides it.
 * If hidden, it fetches and displays the seed phrase from the background script.
 */
async function toggleExistingSeedPhrase() {
  existingSeedPhrase.value = existingSeedPhrase.value.length > 0
    ? ''
    : await walletMessaging.sendMessage('popup:loadSeedPhrase', undefined)
}
/**
 * Handles the restoration of the wallet seed phrase.
 * If the seed phrase is valid, it sets the seed phrase in the walletSeedPhrase injectable.
 * If invalid, it does not set the seed phrase.
 */
async function handleRestoreSeedPhrase() {
  console.log('handleRestoreSeedPhrase', isRestoreSeedPhraseValid.value)
  if (isRestoreSeedPhraseValid.value) {
    // send seed phrase to ancestor component for processing
    emit('restore-seed-phrase', restoreSeedPhrase.value.trim())
    // reset form
    restoreSeedPhrase.value = ''
    overwriteSeedPhrase.value = false
  }
}
/**
 * Validates user-provided seed phrase is valid and does not match
 * the existing seed phrase saved in the wallet
 * @param seedPhrase
 */
function validateSeedPhrase(seedPhrase: string) {
  try {
    return (
      WalletBuilder.isValidSeedPhrase(seedPhrase) &&
      seedPhrase.split(' ').length >= WALLET_BIP39_MIN_WORDS &&
      seedPhrase.split(' ').length <= WALLET_BIP39_MAX_WORDS
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
    <fwb-textarea :rows="2" placeholder="" label="Reveal / Hide Wallet Password" v-model="existingSeedPhrase" readonly>
      <template #footer>
        <FwbP class="text-red-500 dark:text-red-300">IMPORTANT: This password is your Lotus wallet. YOU CANNOT RECOVER
          THIS PASSWORD IF YOU LOSE IT. Keep it safe; memorize it. DO NOT share
          with anyone you would not trust with your bank account.
        </FwbP>
      </template>
    </fwb-textarea>
  </div>
  <div class="py-2">
    <fwb-button :outline="true" color="pink" size="sm" @click="toggleExistingSeedPhrase">
      {{
        existingSeedPhrase ? 'Hide wallet password' : 'Reveal wallet password'
      }}
    </fwb-button>
  </div>
  <div class="py-2">
    <fwb-textarea :rows="2" placeholder="Input your wallet password here and click Restore Wallet"
      label="Restore Lotus Wallet" v-model="restoreSeedPhrase">
    </fwb-textarea>
  </div>
  <div class="py-2 flex justify-between items-center gap-2">
    <fwb-button :disabled="!isRestoreFormDataValid" :outline="true" color="pink" size="sm"
      @click="handleRestoreSeedPhrase">Restore&nbsp;Wallet</fwb-button>
    <div class="flex items-center gap-2" v-show="isRestoreSeedPhraseValid">
      <input type="checkbox" id="overwrite-seed-phrase" v-model="overwriteSeedPhrase" />
      <label for="overwrite-seed-phrase" class="text-red-500 dark:text-red-300">WARNING: This will
        overwrite your existing wallet. Proceed?</label>
    </div>
  </div>
</template>
<!--
  Vue style
-->
<style lang="css"></style>
