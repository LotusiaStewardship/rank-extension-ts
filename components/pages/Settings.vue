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
  <div class="p-4 space-y-6">
    <LoadingSpinnerMessage v-if="!initialized" :message="loadingMessage" />
    <template v-else>
      <!-- Social Media Section -->
      <div class="bg-white dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-4 space-y-4">
        <div>
          <h4 class="text-base font-semibold text-gray-900 dark:text-white">Social Media</h4>
          <div class="border-t border-gray-200 dark:border-gray-700 mt-1.5" />
        </div>

        <!-- Vote Amount Setting -->
        <div class="space-y-1.5">
          <div class="flex items-center gap-2">
            <label class="text-sm font-medium text-gray-900 dark:text-white">Vote Amount (XPI)</label>
            <span v-if="showVoteAmountSaved"
              class="saved-indicator text-xs"
              style="color: hsl(var(--secondary)); animation: fadeInOut 500ms ease-in-out;">✓ Saved</span>
          </div>
          <Input id="vote-amount" v-model="voteAmount" type="number" min="1" step="1"
            placeholder="Enter vote amount in XPI" class="h-9"
            :class="{ 'border-red-500 dark:border-red-400 ring-red-500/20': voteAmountError }"
            @blur="saveVoteAmount" />
          <p class="text-xs text-gray-500 dark:text-gray-400">
            How much Lotus do you want to burn with each vote? (Default: 100 XPI)
          </p>
          <p v-show="voteAmountError" class="text-xs text-red-500 dark:text-red-400 font-medium">
            {{ voteAmountError }}
          </p>
        </div>

        <!-- Auto Blur Posts Setting -->
        <div class="flex items-center justify-between py-1">
          <div class="flex-1 pr-4 space-y-0.5">
            <div class="flex items-center gap-2">
              <label class="text-sm font-medium text-gray-900 dark:text-white">Blur Low-Value Content</label>
              <span v-if="showAutoBlurPostsSaved"
                class="saved-indicator text-xs"
                style="color: hsl(var(--secondary)); animation: fadeInOut 500ms ease-in-out;">✓ Saved</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400">If enabled, will blur content that is ranked below 0 XPI (Default: On)</p>
          </div>
          <Switch v-model="autoBlurPosts" @update:model-value="saveAutoBlurPosts"
            class="shrink-0 switch-purple" />
        </div>

        <!-- Auto Hide Profiles Setting -->
        <div class="flex items-center justify-between py-1">
          <div class="flex-1 pr-4 space-y-0.5">
            <div class="flex items-center gap-2">
              <label class="text-sm font-medium text-gray-900 dark:text-white">Hide Low-Value Creators</label>
              <span v-if="showAutoHideProfilesSaved"
                class="saved-indicator text-xs"
                style="color: hsl(var(--secondary)); animation: fadeInOut 500ms ease-in-out;">✓ Saved</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400">If enabled, content from creators will automatically be hidden if their reputation is below the specified threshold (Default: On)</p>
          </div>
          <Switch v-model="autoHideProfiles" @update:model-value="saveAutoHideProfiles"
            class="shrink-0 switch-purple" />
        </div>

        <!-- Auto Hide Sub-settings (only shown when auto hide profiles is enabled) -->
        <div v-show="autoHideProfiles" class="ml-4 pl-3 border-l border-gray-200 dark:border-gray-700 space-y-4">
          <!-- Auto Hide Threshold Setting -->
          <div class="space-y-1.5">
            <div class="flex items-center gap-2">
              <label class="text-sm font-medium text-gray-900 dark:text-white">Rank Threshold (XPI)</label>
              <span v-if="showAutoHideThresholdSaved"
                class="saved-indicator text-xs"
                style="color: hsl(var(--secondary)); animation: fadeInOut 500ms ease-in-out;">✓ Saved</span>
            </div>
            <Input id="auto-hide-threshold" v-model="autoHideThreshold" type="number"
              placeholder="Enter threshold amount in XPI" class="h-9" @blur="saveAutoHideThreshold" />
            <p class="text-xs text-gray-500 dark:text-gray-400">Creators will be considered low-value if their XPI ranking is below this threshold (Default: -5,000 XPI)</p>
          </div>

          <!-- Auto Hide Positive Vote Toggle & Threshold -->
          <div class="space-y-2">
            <div class="flex items-center justify-between py-1">
              <div class="flex-1 pr-4 space-y-0.5">
                <div class="flex items-center gap-2">
                  <label class="text-sm font-medium text-gray-900 dark:text-white">Reputation Threshold</label>
                  <span v-if="showAutoHidePositiveVoteToggleSaved"
                    class="saved-indicator text-xs"
                    style="color: hsl(var(--secondary)); animation: fadeInOut 500ms ease-in-out;">✓ Saved</span>
                </div>
                <p class="text-xs text-gray-500 dark:text-gray-400">If enabled, creators will be considered low-value if their reputation is below the selected threshold (Default: On)</p>
              </div>
              <Switch v-model="autoHidePositiveVoteToggle"
                @update:model-value="saveAutoHidePositiveVoteToggle"
                class="shrink-0 switch-purple" />
            </div>

            <!-- Threshold selection pills -->
            <div class="flex gap-2 flex-wrap items-center">
              <button v-for="threshold in [50, 60, 70, 80, 90]" :key="threshold"
                type="button"
                :class="[
                  'px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors',
                  autoHidePositiveVoteThreshold === threshold
                    ? 'text-white border-transparent'
                    : 'text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-600 hover:border-purple-400 dark:hover:border-purple-400 hover:text-gray-900 dark:hover:text-white',
                  !autoHidePositiveVoteToggle ? 'opacity-50 pointer-events-none' : 'cursor-pointer'
                ]"
                :style="autoHidePositiveVoteThreshold === threshold ? { backgroundColor: 'hsl(var(--secondary))', borderColor: 'hsl(var(--secondary))' } : {}"
                @click="updateAutoHidePositiveVoteThreshold(threshold.toString())">
                {{ threshold }}%
              </button>
              <span v-if="showAutoHidePositiveVoteThresholdSaved"
                class="saved-indicator text-xs"
                style="color: hsl(var(--secondary)); animation: fadeInOut 500ms ease-in-out;">✓ Saved</span>
            </div>
          </div>

          <!-- Auto Hide If Downvoted Setting -->
          <div class="flex items-center justify-between py-1">
            <div class="flex-1 pr-4 space-y-0.5">
              <div class="flex items-center gap-2">
                <label class="text-sm font-medium text-gray-900 dark:text-white">Only Hide if We Downvoted</label>
                <span v-if="showAutoHideIfDownvotedSaved"
                  class="saved-indicator text-xs"
                  style="color: hsl(var(--secondary)); animation: fadeInOut 500ms ease-in-out;">✓ Saved</span>
              </div>
              <p class="text-xs text-gray-500 dark:text-gray-400">Low-value creators will only be hidden if we have downvoted them with this Lotus wallet</p>
            </div>
            <Switch v-model="autoHideIfDownvoted"
              @update:model-value="saveAutoHideIfDownvoted"
              class="shrink-0 switch-purple" />
          </div>
        </div>
      </div>

      <!-- Wallet Management Section -->
      <div class="bg-white dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-4 space-y-4">
        <div>
          <h4 class="text-base font-semibold text-gray-900 dark:text-white">Wallet Management</h4>
          <div class="border-t border-gray-200 dark:border-gray-700 mt-1.5" />
        </div>

        <!-- Seed phrase reveal area -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-gray-900 dark:text-white">Reveal / Hide Wallet Password</label>
          <Textarea :rows="2" placeholder="" v-model="existingSeedPhrase" readonly class="mt-1" />
        </div>

        <div class="rounded-md border p-3"
          style="border-color: hsla(var(--destructive), 0.3); background-color: hsla(var(--destructive), 0.05);">
          <p class="text-xs font-medium" style="color: hsl(var(--destructive));">
            IMPORTANT: This password is your Lotus wallet. YOU CANNOT RECOVER THIS PASSWORD IF YOU LOSE IT.
            Keep it safe; memorize it. DO NOT share with anyone you would not trust with your bank account.
          </p>
        </div>

        <div>
          <Button variant="outline" size="sm"
            style="color: hsl(var(--secondary)); border-color: hsl(var(--secondary));"
            @click="toggleExistingSeedPhrase">
            {{ existingSeedPhrase ? 'Hide wallet password' : 'Reveal wallet password' }}
          </Button>
        </div>

        <div class="space-y-1.5">
          <label class="text-sm font-medium text-gray-900 dark:text-white">Restore Lotus Wallet</label>
          <Textarea :rows="2" placeholder="Input your wallet password here and click Restore Wallet"
            v-model="restoreSeedPhrase" class="mt-1" />
        </div>

        <div class="flex justify-between items-center gap-2">
          <Button :disabled="!isRestoreFormDataValid" variant="outline" size="sm"
            style="color: hsl(var(--secondary)); border-color: hsl(var(--secondary));"
            @click="handleRestoreSeedPhrase">Restore&nbsp;Wallet</Button>
          <div class="flex items-center gap-2" v-show="isRestoreSeedPhraseValid">
            <input type="checkbox" id="overwrite-seed-phrase" v-model="overwriteSeedPhrase"
              style="accent-color: hsl(var(--secondary));" />
            <label for="overwrite-seed-phrase" style="color: hsl(var(--destructive));" class="text-xs font-medium">WARNING: This will
              overwrite your existing wallet. Proceed?</label>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style lang="css" scoped>
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

/* Ensure Switch checked state uses purple accent via CSS variable */
.switch-purple[data-state="checked"] {
  background-color: hsl(var(--secondary)) !important;
}

/* Style unchecked track to be visible in dark mode */
.switch-purple[data-state="unchecked"] {
  background-color: hsl(var(--input));
}

/* Saved indicator inline animation */
.saved-indicator {
  display: inline-block;
}</style>
