<script setup lang="ts">
/** Vue components */
import { FwbTextarea, FwbButton, FwbP, FwbInput, FwbToggle, FwbHeading } from 'flowbite-vue'
import LoadingSpinnerMessage from '@/components/LoadingSpinnerMessage.vue'
/** Modules and types */
import type { ShallowRef } from 'vue'
import { settingsStore, DefaultExtensionSettings } from '@/entrypoints/background/stores/settings'
import { walletMessaging } from '@/entrypoints/background/messaging'
import { WalletBuilder } from '@/entrypoints/background/modules/wallet'
import {
  WALLET_BIP39_MIN_WORDS,
  WALLET_BIP39_MAX_WORDS,
} from '@/utils/constants'
/**
 * Vue component definitions
 */
const emit = defineEmits<{
  'restore-seed-phrase': [string]
}>()
/**
 * Vue refs
 */
/** Loading message */
const loadingMessage = shallowRef('Loading settings...')
// Wallet reactive properties
const existingSeedPhrase = shallowRef('')
const restoreSeedPhrase = shallowRef('')
const overwriteSeedPhrase = shallowRef(false)
// Settings reactive properties
const voteAmount = shallowRef<string | null>(null)
const autoHideProfiles = shallowRef<boolean | null>(null)
const autoHideThreshold = shallowRef<string | null>(null)
const autoHideIfDownvoted = shallowRef<boolean | null>(null)
const voteAmountError = shallowRef('')
// Visual feedback indicators for saved settings
const showVoteAmountSaved = shallowRef(false)
const showAutoHideProfilesSaved = shallowRef(false)
const showAutoHideThresholdSaved = shallowRef(false)
const showAutoHideIfDownvotedSaved = shallowRef(false)
/**
 * Vue computed properties
 */
const isRestoreFormDataValid = computed(() => {
  return isRestoreSeedPhraseValid.value && overwriteSeedPhrase.value
})
const isRestoreSeedPhraseValid = computed(() => validateSeedPhrase(restoreSeedPhrase.value))
const initialized = computed(() => (
  voteAmount.value !== null &&
  autoHideProfiles.value !== null &&
  autoHideThreshold.value !== null &&
  autoHideIfDownvoted.value !== null
)
)
/**
 * Functions
 */

/**
 * Shows a saved indicator for a specific setting
 * @param indicatorRef - The reactive reference for the indicator
 */
function showSavedIndicator(indicatorRef: ShallowRef<boolean>) {
  indicatorRef.value = true
  setTimeout(() => {
    indicatorRef.value = false
  }, 500)
}
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
  const length = seedPhrase.split(' ').length
  try {
    return (
      WalletBuilder.isValidSeedPhrase(seedPhrase) &&
      length >= WALLET_BIP39_MIN_WORDS &&
      length <= WALLET_BIP39_MAX_WORDS
    )
  } catch (e) {
    console.warn(e)
    return false
  }
}
/**
 * Validates vote amount is at least 1 XPI
 * @param amount - The vote amount in XPI
 * @returns true if valid, false otherwise
 */
function validateVoteAmount(amount: string): boolean {
  const numAmount = parseFloat(amount)
  return !isNaN(numAmount) && numAmount >= 1
}
/**
 * Load settings from storage
 */
async function loadSettings() {
  try {
    const voteAmountSetting = await settingsStore.voteAmountStorageItem.getValue()
    const autoHideProfilesSetting = await settingsStore.autoHideProfilesStorageItem.getValue()
    const autoHideThresholdSetting = await settingsStore.autoHideThresholdStorageItem.getValue()
    const autoHideIfDownvotedSetting = await settingsStore.autoHideIfDownvotedStorageItem.getValue()

    voteAmount.value = voteAmountSetting.value
    autoHideProfiles.value = autoHideProfilesSetting.value === 'true'
    autoHideThreshold.value = autoHideThresholdSetting.value
    autoHideIfDownvoted.value = autoHideIfDownvotedSetting.value === 'true'
  } catch (error) {
    console.error('Failed to load settings:', error)
  }
}
/**
 * Save vote amount setting
 */
async function saveVoteAmount() {
  // Clear previous error
  voteAmountError.value = ''

  // Validate vote amount
  if (!validateVoteAmount(voteAmount.value ?? '')) {
    voteAmountError.value = 'Vote amount must be at least 1 XPI'
    return
  }

  try {
    await settingsStore.voteAmountStorageItem.setValue({
      name: 'voteAmount',
      type: 'input',
      value: voteAmount.value ?? DefaultExtensionSettings.voteAmount.value,
    })
    showSavedIndicator(showVoteAmountSaved)
  } catch (error) {
    console.error('Failed to save vote amount:', error)
    voteAmountError.value = 'Failed to save vote amount'
  }
}
/**
 * Save auto hide profiles setting
 */
async function saveAutoHideProfiles() {
  try {
    await settingsStore.autoHideProfilesStorageItem.setValue({
      name: 'autoHideProfiles',
      type: 'toggle',
      value: autoHideProfiles.value?.toString() ?? DefaultExtensionSettings.autoHideProfiles.value,
      subSettings: ['autoHideThreshold', 'autoHideIfDownvoted'],
    })
    showSavedIndicator(showAutoHideProfilesSaved)
  } catch (error) {
    console.error('Failed to save auto hide profiles:', error)
  }
}
/**
 * Save auto hide threshold setting
 */
async function saveAutoHideThreshold() {
  try {
    await settingsStore.autoHideThresholdStorageItem.setValue({
      name: 'autoHideThreshold',
      type: 'input',
      value: autoHideThreshold.value ?? DefaultExtensionSettings.autoHideThreshold.value,
    })
    showSavedIndicator(showAutoHideThresholdSaved)
  } catch (error) {
    console.error('Failed to save auto hide threshold:', error)
  }
}
/**
 * Save auto hide if downvoted setting
 */
async function saveAutoHideIfDownvoted() {
  try {
    await settingsStore.autoHideIfDownvotedStorageItem.setValue({
      name: 'autoHideIfDownvoted',
      type: 'toggle',
      value: autoHideIfDownvoted.value?.toString() ?? DefaultExtensionSettings.autoHideIfDownvoted.value,
    })
    showSavedIndicator(showAutoHideIfDownvotedSaved)
  } catch (error) {
    console.error('Failed to save auto hide if downvoted:', error)
  }
}
/**
 * Vue lifecycle hooks
 */
onMounted(() => {
  loadSettings()
})
</script>
<template>
  <div class="py-2 px-6">
    <!-- Extension Settings Section -->
    <FwbHeading class="pb-2" color="dark:text-white" tag="h4">
      Settings
    </FwbHeading>
    <FwbP>
      Customize your Lotusia experience and manage your Lotus wallet
    </FwbP>

    <LoadingSpinnerMessage v-if="!initialized" :message="loadingMessage" />
    <template v-else>
      <!-- Lotusia Reputation Section -->
      <div class="mb-4">
        <h5 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">Social Media</h5>
        <hr class="border-gray-200 dark:border-gray-600 mb-2">

        <!-- Vote Amount Setting -->
        <div class="py-2">
          <div class="flex items-center gap-2 mb-2">
            <label class="text-sm font-medium text-gray-900 dark:text-white">Vote Amount (XPI)</label>
            <!-- Saved indicator -->
            <span v-if="showVoteAmountSaved"
              class="saved-indicator text-xs text-purple-600 dark:text-purple-400 font-medium">✓
              Saved</span>
          </div>
          <fwb-input id="vote-amount" v-model="(voteAmount as string)" type="number" size="sm" min="1" step="1"
            placeholder="Enter vote amount in XPI" @blur="saveVoteAmount">
            <template #helper>
              <fwb-p class="text-xs text-gray-500 dark:text-gray-400">
                How much Lotus do you want to burn with each vote? (Default: 100 XPI)
              </fwb-p>
            </template>
          </fwb-input>
          <fwb-p v-show="voteAmountError" class="text-red-500 dark:text-red-400">
            {{ voteAmountError }}
          </fwb-p>
        </div>

        <!-- Auto Hide Profiles Setting -->
        <div class="py-2">
          <div class="flex items-center justify-between">
            <div class="pr-4">
              <div class="flex items-center gap-2 mb-1">
                <label class="text-sm font-medium text-gray-900 dark:text-white">Hide Low-Value Content</label>
                <!-- Saved indicator -->
                <span v-if="showAutoHideProfilesSaved"
                  class="saved-indicator text-xs text-purple-600 dark:text-purple-400 font-medium">✓
                  Saved</span>
              </div>
              <fwb-p class="text-gray-500 dark:text-gray-400">
                If enabled, content will automatically be hidden if the profile's reputation is below the specified
                threshold
              </fwb-p>
            </div>
            <fwb-toggle color="purple" v-model="(autoHideProfiles as boolean)" @change="saveAutoHideProfiles" />
          </div>
        </div>

        <!-- Auto Hide Threshold Setting (only shown when auto hide profiles is enabled) -->
        <div class="py-2 border-l border-gray-200 dark:border-gray-600" v-show="autoHideProfiles">
          <div class="pl-3">
            <div class="flex items-center gap-2 mb-1">
              <label class="text-sm font-medium text-gray-900 dark:text-white">Reputation Threshold (XPI)</label>
              <!-- Saved indicator -->
              <span v-if="showAutoHideThresholdSaved"
                class="saved-indicator text-xs text-purple-600 dark:text-purple-400 font-medium">✓
                Saved</span>
            </div>
            <fwb-input id="auto-hide-threshold" v-model="(autoHideThreshold as string)" type="number"
              placeholder="Enter threshold amount in XPI" size="sm" @blur="saveAutoHideThreshold">
              <template #helper>
                <fwb-p class="text-xs text-gray-500 dark:text-gray-400">
                  (Default: -5,000 XPI)
                </fwb-p>
              </template>
            </fwb-input>
          </div>
        </div>

        <!-- Auto Hide If Downvoted Setting (only shown when auto hide profiles is enabled) -->
        <div class="py-2 border-l border-gray-200 dark:border-gray-600" v-show="autoHideProfiles">
          <div class="pl-3">
            <div class="flex items-center justify-between">
              <div class="pr-4">
                <div class="flex items-center gap-2 mb-1">
                  <label class="text-sm font-medium text-gray-900 dark:text-white">Only Hide if We
                    Downvoted</label>
                  <!-- Saved indicator -->
                  <span v-if="showAutoHideIfDownvotedSaved"
                    class="saved-indicator text-xs text-purple-600 dark:text-purple-400 font-medium">✓
                    Saved</span>
                </div>
                <fwb-p class="text-gray-500 dark:text-gray-400">
                  Low-value content will only be hidden if we have downvoted the profile with this Lotus wallet
                </fwb-p>
              </div>
              <fwb-toggle color="purple" v-model="(autoHideIfDownvoted as boolean)" @change="saveAutoHideIfDownvoted" />
            </div>
          </div>
        </div>
      </div>

      <!-- Wallet Management Section -->
      <div class="mb-4">
        <h5 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">Wallet Management</h5>
        <hr class="border-gray-200 dark:border-gray-600 mb-2">

        <!-- Wallet Section -->
        <div class="py-2">
          <fwb-textarea :rows="2" placeholder="" label="Reveal / Hide Wallet Password" v-model="existingSeedPhrase"
            readonly>
            <template #footer>
              <FwbP class="text-red-500 dark:text-red-300">IMPORTANT: This password is your Lotus wallet. YOU CANNOT
                RECOVER
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
      </div>

    </template>
  </div>
</template>
<style lang="css" scoped>
.pb-2 {
  padding-bottom: 0.5rem;
}

.saved-indicator {
  display: inline-block !important;
  animation: fadeInOut 500ms ease-in-out;
}

@keyframes fadeInOut {
  0% {
    opacity: 1;
  }

  80% {
    opacity: 1;
  }

  100% {
    opacity: 0;
  }
}
</style>
