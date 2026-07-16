<!--
 * Copyright 2025 The Lotusia Stewardship
 * Github: https://github.com/LotusiaStewardship
 * License: MIT
 -->
<script setup lang="ts">
/** Vue components */
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import LoadingSpinnerMessage from '@/components/LoadingSpinnerMessage.vue'
/** Modules and types */
import type { ShallowRef } from 'vue'
import type { SettingName, Setting, SettingLocale } from '@/entrypoints/background/stores/settings'
import { settingsStore, DefaultExtensionSettings } from '@/entrypoints/background/stores/settings'
import { walletMessaging } from '@/entrypoints/background/messaging'
import { WalletBuilder } from '@/entrypoints/background/modules/wallet'
import {
  WALLET_BIP39_MIN_WORDS,
  WALLET_BIP39_MAX_WORDS,
} from '@/utils/constants'
/**
 * Constants
 */
/** Setting locales, not in use yet */
const SettingsLocale: SettingLocale[] = [
  {
    name: 'voteAmount',
    label: 'Vote Amount (XPI)',
    placeholder: 'Enter vote amount in XPI',
    helper: 'How much Lotus do you want to burn with each vote? (Default: 100 XPI)',
  },
  {
    name: 'autoBlurPosts',
    label: 'Blur Low-Value Content',
    placeholder: '',
    helper: 'If enabled, low-value content from any creator will be blurred (Default: On)',
  },
  {
    name: 'autoHideProfiles',
    label: 'Hide Low-Value Creators',
    placeholder: '',
    helper: 'If enabled, content from creators will automatically be hidden if their reputation is below the specified threshold (Default: On)',
  },
  {
    name: 'autoHideThreshold',
    label: 'Reputation Threshold (XPI)',
    placeholder: 'Enter threshold amount in XPI',
    helper: '(Default: -5,000 XPI)',
  },
  {
    name: 'autoHidePositiveVoteToggle',
    label: 'Positive Reputation Threshold (%)',
    placeholder: 'Enter threshold amount in percentage points',
    helper: 'For example, creators with 1 positive vote and 10 negative votes will have a positive ratio less than 10% and will be considered low-value (Default: 10%)',
  },
  {
    name: 'autoHidePositiveVoteThreshold',
    label: 'Positive Reputation Threshold (%)',
    placeholder: 'Enter threshold amount in percentage points',
    helper: 'For example, creators with 1 positive vote and 10 negative votes will have a positive ratio less than 10% and will be considered low-value (Default: 10%)',
  },
  {
    name: 'autoHideIfDownvoted',
    label: 'Only Hide if We Downvoted',
    helper: 'Low-value creators will only be hidden if we have downvoted them with this Lotus wallet',
  }
]
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
const voteAmount = shallowRef<string>('')
const autoBlurPosts: ShallowRef<undefined | boolean> = shallowRef()
const autoHideProfiles: ShallowRef<undefined | boolean> = shallowRef()
const autoHideThreshold = shallowRef<string>('')
const autoHidePositiveVoteToggle: ShallowRef<undefined | boolean> = shallowRef()
const autoHidePositiveVoteThreshold = shallowRef<number>(10)
const autoHideIfDownvoted: ShallowRef<undefined | boolean> = shallowRef()
const voteAmountError = shallowRef('')
// Visual feedback indicators for saved settings
const showVoteAmountSaved = shallowRef(false)
const showAutoBlurPostsSaved = shallowRef(false)
const showAutoHideProfilesSaved = shallowRef(false)
const showAutoHideThresholdSaved = shallowRef(false)
const showAutoHidePositiveVoteToggleSaved = shallowRef(false)
const showAutoHidePositiveVoteThresholdSaved = shallowRef(false)
const showAutoHideIfDownvotedSaved = shallowRef(false)
/**
 * Vue computed properties
 */
const isRestoreFormDataValid = computed(() => {
  return isRestoreSeedPhraseValid.value && overwriteSeedPhrase.value
})
const isRestoreSeedPhraseValid = computed(() => validateSeedPhrase(restoreSeedPhrase.value))
const initialized = computed(() =>
  voteAmount.value !== '' &&
  autoBlurPosts.value !== undefined &&
  autoHideProfiles.value !== undefined &&
  autoHideThreshold.value !== '' &&
  autoHidePositiveVoteToggle.value !== undefined &&
  autoHidePositiveVoteThreshold.value !== undefined &&
  autoHideIfDownvoted.value !== undefined
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
    const autoBlurPostsSetting = await settingsStore.autoBlurPostsStorageItem.getValue()
    const autoHideProfilesSetting = await settingsStore.autoHideProfilesStorageItem.getValue()
    const autoHideThresholdSetting = await settingsStore.autoHideThresholdStorageItem.getValue()
    const autoHidePositiveVoteToggleSetting = await settingsStore.autoHidePositiveVoteToggleStorageItem.getValue()
    const autoHidePositiveVoteThresholdSetting = await settingsStore.autoHidePositiveVoteThresholdStorageItem.getValue()
    const autoHideIfDownvotedSetting = await settingsStore.autoHideIfDownvotedStorageItem.getValue()

    voteAmount.value = voteAmountSetting.value
    autoBlurPosts.value = autoBlurPostsSetting.value === 'true'
    autoHideProfiles.value = autoHideProfilesSetting.value === 'true'
    autoHideThreshold.value = autoHideThresholdSetting.value
    autoHidePositiveVoteToggle.value = autoHidePositiveVoteToggleSetting.value === 'true'
    autoHidePositiveVoteThreshold.value = parseInt(autoHidePositiveVoteThresholdSetting.value)
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
      value: voteAmount.value,
    })
    showSavedIndicator(showVoteAmountSaved)
  } catch (error) {
    console.error('Failed to save vote amount:', error)
    voteAmountError.value = 'Failed to save vote amount'
  }
}
/**
 * Save auto blur posts setting
 */
async function saveAutoBlurPosts() {
  // If the value is undefined, set it to the default value
  if (autoBlurPosts.value === undefined) {
    autoBlurPosts.value = DefaultExtensionSettings.autoBlurPosts.value === 'true'
  }
  try {
    await settingsStore.autoBlurPostsStorageItem.setValue({
      name: 'autoBlurPosts',
      type: 'toggle',
      value: autoBlurPosts.value.toString(),
    })
    showSavedIndicator(showAutoBlurPostsSaved)
  } catch (error) {
    console.error('Failed to save auto blur posts:', error)
  }
}
/**
 * Save auto hide profiles setting
 */
async function saveAutoHideProfiles() {
  if (autoHideProfiles.value === undefined) {
    autoHideProfiles.value = DefaultExtensionSettings.autoHideProfiles.value === 'true'
  }
  try {
    await settingsStore.autoHideProfilesStorageItem.setValue({
      name: 'autoHideProfiles',
      type: 'toggle',
      value: autoHideProfiles.value?.toString(),
      subSettings: ['autoHideThreshold', 'autoHidePositiveVoteThreshold', 'autoHideIfDownvoted'],
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
  if (autoHideThreshold.value === '') {
    autoHideThreshold.value = DefaultExtensionSettings.autoHideThreshold.value
  }
  try {
    await settingsStore.autoHideThresholdStorageItem.setValue({
      name: 'autoHideThreshold',
      type: 'input',
      value: autoHideThreshold.value,
    })
    showSavedIndicator(showAutoHideThresholdSaved)
  } catch (error) {
    console.error('Failed to save auto hide threshold:', error)
  }
}
/**
 * Universal save function for auto hide positive vote threshold setting
 */
async function saveAutoHidePositiveVoteThreshold() {
  if (autoHidePositiveVoteThreshold.value === undefined) {
    autoHidePositiveVoteThreshold.value = parseInt(DefaultExtensionSettings.autoHidePositiveVoteThreshold.value)
  }
  try {
    await settingsStore.autoHidePositiveVoteThresholdStorageItem.setValue({
      name: 'autoHidePositiveVoteThreshold',
      type: 'slider',
      value: autoHidePositiveVoteThreshold.value.toString(),
    })
    showSavedIndicator(showAutoHidePositiveVoteThresholdSaved)
  } catch (error) {
    console.error('Failed to save auto hide positive vote threshold:', error)
  }
}
/**
 * Save auto hide positive vote toggle setting
 */
async function saveAutoHidePositiveVoteToggle() {
  if (autoHidePositiveVoteToggle.value === undefined) {
    autoHidePositiveVoteToggle.value = DefaultExtensionSettings.autoHidePositiveVoteToggle.value === 'true'
  }
  try {
    await settingsStore.autoHidePositiveVoteToggleStorageItem.setValue({
      name: 'autoHidePositiveVoteToggle',
      type: 'toggle',
      value: autoHidePositiveVoteToggle.value?.toString(),
    })
    showSavedIndicator(showAutoHidePositiveVoteToggleSaved)
  } catch (error) {
    console.error('Failed to save auto hide positive vote toggle:', error)
  }
}
/**
 * Update auto hide positive vote threshold from radio button selection
 */
async function updateAutoHidePositiveVoteThreshold(threshold: string) {
  const thresholdInt = parseInt(threshold)
  if (thresholdInt !== autoHidePositiveVoteThreshold.value) {
    autoHidePositiveVoteThreshold.value = thresholdInt
    await saveAutoHidePositiveVoteThreshold()
  }
}
/**
 * Save auto hide if downvoted setting
 */
async function saveAutoHideIfDownvoted() {
  if (autoHideIfDownvoted.value === undefined) {
    autoHideIfDownvoted.value = DefaultExtensionSettings.autoHideIfDownvoted.value === 'true'
  }
  try {
    await settingsStore.autoHideIfDownvotedStorageItem.setValue({
      name: 'autoHideIfDownvoted',
      type: 'toggle',
      value: autoHideIfDownvoted.value?.toString(),
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
    <!-- Page Heading -->
    <div class="mb-5">
      <h4 class="text-base font-semibold text-gray-900 dark:text-gray-100">Social Media</h4>
      <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Customize your Lotusia experience</p>
    </div>

    <LoadingSpinnerMessage v-if="!initialized" :message="loadingMessage" />
    <template v-else>
      <!-- Social Media Settings -->
      <div>
        <!-- Vote Amount Setting -->
        <div class="py-3">
          <div class="flex items-center gap-2 mb-1.5">
            <label for="vote-amount" class="text-sm font-medium text-gray-900 dark:text-gray-100">Vote Amount (XPI)</label>
            <span v-if="showVoteAmountSaved" class="text-xs text-purple-600 dark:text-purple-400 font-medium">Saved</span>
          </div>
          <Input id="vote-amount" v-model="voteAmount" type="number" min="1" step="1"
            placeholder="Enter vote amount in XPI"
            class="h-9"
            :class="{ 'border-red-500 dark:border-red-400': voteAmountError }"
            @blur="saveVoteAmount" />
          <p v-if="voteAmountError" class="text-xs text-red-500 dark:text-red-400 mt-1.5">{{ voteAmountError }}</p>
          <p v-else class="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
            How much Lotus do you want to burn with each vote? (Default: 100 XPI)
          </p>
        </div>

        <!-- Auto Blur Posts Setting -->
        <div class="flex items-start justify-between py-3">
          <div class="flex-1 pr-4 min-w-0">
            <div class="flex items-center gap-2 mb-0.5">
              <label class="text-sm font-medium text-gray-900 dark:text-gray-100">Blur Low-Value Content</label>
              <span v-if="showAutoBlurPostsSaved" class="text-xs text-purple-600 dark:text-purple-400 font-medium">Saved</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              If enabled, will blur content that is ranked below 0 XPI (Default: On)
            </p>
          </div>
          <Switch v-model="autoBlurPosts" @update:model-value="saveAutoBlurPosts" class="data-[state=checked]:bg-purple-600 shrink-0 mt-0.5" />
        </div>

        <!-- Auto Hide Profiles Setting -->
        <div class="flex items-start justify-between py-3">
          <div class="flex-1 pr-4 min-w-0">
            <div class="flex items-center gap-2 mb-0.5">
              <label class="text-sm font-medium text-gray-900 dark:text-gray-100">Hide Low-Value Creators</label>
              <span v-if="showAutoHideProfilesSaved" class="text-xs text-purple-600 dark:text-purple-400 font-medium">Saved</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              If enabled, content from creators will automatically be hidden if their reputation is below the specified threshold (Default: On)
            </p>
          </div>
          <Switch v-model="autoHideProfiles" @update:model-value="saveAutoHideProfiles" class="data-[state=checked]:bg-purple-600 shrink-0 mt-0.5" />
        </div>

        <!-- Nested sub-section (only shown when autoHideProfiles is enabled) -->
        <div v-show="autoHideProfiles" class="ml-2 pl-4 border-l-2 border-gray-100 dark:border-gray-800 space-y-1">
          <!-- Auto Hide Threshold Input -->
          <div class="py-3">
            <div class="flex items-center gap-2 mb-1.5">
              <label for="auto-hide-threshold" class="text-sm font-medium text-gray-900 dark:text-gray-100">Rank Threshold (XPI)</label>
              <span v-if="showAutoHideThresholdSaved" class="text-xs text-purple-600 dark:text-purple-400 font-medium">Saved</span>
            </div>
            <Input id="auto-hide-threshold" v-model="autoHideThreshold" type="number"
              placeholder="Enter threshold amount in XPI" class="h-9" @blur="saveAutoHideThreshold" />
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
              Creators will be considered low-value if their XPI ranking is below this threshold (Default: -5,000 XPI)

            </p>
          </div>

          <!-- Reputation Threshold toggle + pills -->
          <div class="py-3">
            <div class="flex items-start justify-between">
              <div class="flex-1 pr-4 min-w-0">
                <div class="flex items-center gap-2 mb-0.5">
                  <label class="text-sm font-medium text-gray-900 dark:text-gray-100">Reputation Threshold</label>
                  <span v-if="showAutoHidePositiveVoteToggleSaved" class="text-xs text-purple-600 dark:text-purple-400 font-medium">Saved</span>
                </div>
                <p class="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                  If enabled, creators will be considered low-value if their reputation is below the selected threshold (Default: On)
                </p>
              </div>
              <Switch v-model="autoHidePositiveVoteToggle"
                @update:model-value="saveAutoHidePositiveVoteToggle"
                class="data-[state=checked]:bg-purple-600 shrink-0 mt-0.5" />

            </div>
            <!-- Threshold pills -->
            <div class="mt-3 pt-1">
              <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">Minimum positive vote ratio:</p>
              <div class="flex gap-2 flex-wrap">
                <button v-for="threshold in [50, 60, 70, 80, 90]" :key="threshold" type="button"
                  :disabled="!autoHidePositiveVoteToggle"
                  @click="updateAutoHidePositiveVoteThreshold(threshold.toString())"
                  class="px-3.5 py-1.5 text-xs font-medium rounded-md border transition-all duration-150"
                  :class="autoHidePositiveVoteThreshold === threshold
                    ? 'bg-pink-600 text-white border-pink-600 dark:bg-pink-500 dark:border-pink-500'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-pink-300 dark:hover:border-pink-700'"
                >
                  {{ threshold }}%
                </button>
              </div>
            </div>
          </div>

          <!-- Auto Hide If Downvoted toggle -->
          <div class="flex items-start justify-between py-3">
            <div class="flex-1 pr-4 min-w-0">
              <div class="flex items-center gap-2 mb-0.5">
                <label class="text-sm font-medium text-gray-900 dark:text-gray-100">Only Hide if We Downvoted</label>
                <span v-if="showAutoHideIfDownvotedSaved" class="text-xs text-purple-600 dark:text-purple-400 font-medium">Saved</span>
              </div>
              <p class="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                Low-value creators will only be hidden if we have downvoted them with this Lotus wallet
              </p>
            </div>
            <Switch v-model="autoHideIfDownvoted"
              @update:model-value="saveAutoHideIfDownvoted"
              class="data-[state=checked]:bg-purple-600 shrink-0 mt-0.5" />
          </div>
        </div>
      </div>

      <!-- Wallet Management Section -->
      <div class="mt-6 pt-5 border-t border-gray-200 dark:border-gray-700">
        <h5 class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-0.5">Wallet Management</h5>
        <p class="text-xs text-gray-500 dark:text-gray-400 mb-4">Reveal, restore, and manage your Lotus wallet password</p>

        <!-- Seed Phrase Reveal -->
        <div class="py-2">
          <label class="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1.5 block">Wallet Password</label>
          <Textarea :rows="2" placeholder="" v-model="existingSeedPhrase" readonly class="w-full" />
          <div class="flex items-center justify-between mt-2">
            <Button variant="outline" size="sm"
              class="text-pink-600 border-pink-600 hover:bg-pink-50 dark:text-pink-400 dark:border-pink-400 dark:hover:bg-pink-950"
              @click="toggleExistingSeedPhrase">
              {{ existingSeedPhrase ? 'Hide wallet password' : 'Reveal wallet password' }}
            </Button>
            <p class="text-xs text-amber-600 dark:text-amber-400 font-medium">
              ⚠ Keep this safe — it cannot be recovered
            </p>
          </div>
        </div>

        <!-- Restore Wallet -->
        <div class="py-2 mt-2">
          <label class="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1.5 block">Restore Lotus Wallet</label>
          <Textarea :rows="2" placeholder="Input your wallet password here and click Restore Wallet"
            v-model="restoreSeedPhrase" class="w-full" />
          <div class="flex items-center justify-between mt-2.5">
            <div class="flex items-center gap-2" v-show="isRestoreSeedPhraseValid">
              <input type="checkbox" id="overwrite-seed-phrase" v-model="overwriteSeedPhrase"
                class="rounded border-gray-300 dark:border-gray-600 text-purple-600 focus:ring-purple-500" />
              <label for="overwrite-seed-phrase" class="text-xs text-red-500 dark:text-red-400 font-medium">
                This will overwrite your existing wallet. Proceed?
              </label>
            </div>
            <Button :disabled="!isRestoreFormDataValid" variant="outline" size="sm"
              class="text-pink-600 border-pink-600 hover:bg-pink-50 dark:text-pink-400 dark:border-pink-400 dark:hover:bg-pink-950 ml-auto"
              @click="handleRestoreSeedPhrase">
              Restore Wallet
            </Button>
          </div>
        </div>
      </div>

    </template>
  </div>
</template>
