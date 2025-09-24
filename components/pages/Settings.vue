<!--
 * Copyright 2025 The Lotusia Stewardship
 * Github: https://github.com/LotusiaStewardship
 * License: MIT
 -->
<script setup lang="ts">
/** Vue components */
import { FwbTextarea, FwbButton, FwbP, FwbInput, FwbToggle, FwbHeading, FwbRadio } from 'flowbite-vue'
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
          <fwb-input id="vote-amount" v-model="voteAmount" type="number" size="sm" min="1" step="1"
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

        <!-- Auto Blur Posts Setting -->
        <div class="py-2">
          <div class="flex items-center justify-between">
            <div class="pr-4">
              <div class="flex items-center gap-2 mb-1">
                <label class="text-sm font-medium text-gray-900 dark:text-white">Blur Low-Value Content</label>
                <!-- Saved indicator -->
                <span v-if="showAutoBlurPostsSaved"
                  class="saved-indicator text-xs text-purple-600 dark:text-purple-400 font-medium">✓
                  Saved</span>
              </div>
              <fwb-p class="text-gray-500 dark:text-gray-400">
                If enabled, will blur content that is ranked below 0 XPI (Default: On)
              </fwb-p>
            </div>
            <fwb-toggle color="purple" v-model="autoBlurPosts" @change="saveAutoBlurPosts" />
          </div>
        </div>

        <!-- Auto Hide Profiles Setting -->
        <div class="py-2">
          <div class="flex items-center justify-between">
            <div class="pr-4">
              <div class="flex items-center gap-2 mb-1">
                <label class="text-sm font-medium text-gray-900 dark:text-white">Hide Low-Value Creators</label>
                <!-- Saved indicator -->
                <span v-if="showAutoHideProfilesSaved"
                  class="saved-indicator text-xs text-purple-600 dark:text-purple-400 font-medium">✓
                  Saved</span>
              </div>
              <fwb-p class="text-gray-500 dark:text-gray-400">
                If enabled, content from creators will automatically be hidden if their reputation is below the
                specified threshold (Default: On)
              </fwb-p>
            </div>
            <fwb-toggle color="purple" v-model="autoHideProfiles" @change="saveAutoHideProfiles" />
          </div>
        </div>

        <!-- Auto Hide Threshold Setting (only shown when auto hide profiles is enabled) -->
        <div class="py-2 border-l border-gray-200 dark:border-gray-600" v-show="autoHideProfiles">
          <div class="pl-3">
            <div class="flex items-center gap-2 mb-1">
              <label class="text-sm font-medium text-gray-900 dark:text-white">Rank Threshold (XPI)</label>
              <!-- Saved indicator -->
              <span v-if="showAutoHideThresholdSaved"
                class="saved-indicator text-xs text-purple-600 dark:text-purple-400 font-medium">✓
                Saved</span>
            </div>
            <fwb-input id="auto-hide-threshold" v-model="autoHideThreshold" type="number"
              placeholder="Enter threshold amount in XPI" size="sm" @blur="saveAutoHideThreshold">
              <template #helper>
                <fwb-p class="text-xs text-gray-500 dark:text-gray-400">
                  Creators will be considered low-value if their XPI ranking is below this threshold (Default:
                  -5,000 XPI)
                </fwb-p>
              </template>
            </fwb-input>
          </div>
        </div>

        <!-- Auto Hide Threshold for Positive Vote Ratio (only shown when auto hide profiles is enabled) -->
        <div class="py-2 border-l border-gray-200 dark:border-gray-600" v-show="autoHideProfiles">
          <div class="pl-3">
            <div class="flex items-center justify-between">

              <div class="pr-4 pb-2">
                <div class="flex items-center gap-2 mb-1">
                  <label class="text-sm font-medium text-gray-900 dark:text-white">Reputation Threshold</label>
                  <!-- Saved indicator -->
                  <span v-if="showAutoHidePositiveVoteThresholdSaved"
                    class="saved-indicator text-xs text-purple-600 dark:text-purple-400 font-medium">✓
                    Saved</span>
                </div>
                <fwb-p class="text-xs text-gray-500 dark:text-gray-400">
                  If enabled, creators will be considered low-value if their reputation is below the selected
                  threshold
                  (Default: On)
                </fwb-p>
              </div>
              <fwb-toggle color="purple" v-model="autoHidePositiveVoteToggle"
                @change="saveAutoHidePositiveVoteToggle" />
            </div>
            <div class="p-2">
              <div class="flex justify-between items-start">
                <!-- Template profile avatars with sentiment badges - clickable selection -->
                <div v-for="threshold in [50, 60, 70, 80, 90]" :key="threshold"
                  class="template-avatar-container flex flex-col items-center">
                  <div class="template-avatar avatar-reputation cursor-pointer transition-all duration-200"
                    :class="{ 'avatar-selected': autoHidePositiveVoteThreshold === threshold, 'greyed-out': !autoHidePositiveVoteToggle }"
                    :data-vote-ratio="threshold.toString()"
                    @click="updateAutoHidePositiveVoteThreshold(threshold.toString())">
                    <div class="template-avatar-image flex items-center justify-center">
                      <span class="text-xs font-semibold text-white dark:text-white ">
                        {{ threshold }}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
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
                  Low-value creators will only be hidden if we have downvoted them with this Lotus wallet
                </fwb-p>
              </div>
              <fwb-toggle color="purple" v-model="autoHideIfDownvoted" @change="saveAutoHideIfDownvoted" />
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
<style lang="css">
.pb-2 {
  padding-bottom: 0.5rem;
}

.greyed-out {
  opacity: 0.5;
  pointer-events: none;
  filter: grayscale(100%);
  cursor: not-allowed;
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

/* Template avatar styles */
.template-avatar-container {
  display: flex;
  align-items: center;
  justify-content: center;
}

.template-avatar {
  position: relative;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  /* overflow: hidden; */
}

.template-avatar-image {
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 50%;
}

/* Avatar selection indicator */
.template-avatar.avatar-selected:not(.greyed-out) {
  transform: scale(1.15);
  cursor: default;
}

.template-avatar.avatar-selected:not(.greyed-out) .template-avatar-image {
  background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
}

/* Avatar reputation badge colors for template avatars */
.template-avatar.avatar-reputation {
  position: relative;
}

.template-avatar.avatar-reputation::after {
  content: '';
  position: absolute;
  left: 0%;
  top: 0%;
  height: 25%;
  width: 25%;
  border-radius: 50%;
  outline: 0.15rem solid;
}

@media (prefers-color-scheme: dark) {
  :root {
    --sentiment-90: rgb(5 223 114);
    --sentiment-80: rgb(154 230 0);
    --sentiment-70: rgb(253 199 0);
    --sentiment-60: rgb(255 185 0);
    --sentiment-50: rgb(255 137 4);
  }

  .template-avatar.avatar-reputation::after {
    outline-color: rgb(31 41 55);
  }

  .template-avatar.avatar-selected:not(.greyed-out) {
    box-shadow: 0 0 0 0.1rem rgba(236, 202, 235, 0.5);
  }
}

@media (prefers-color-scheme: light) {
  :root {
    --sentiment-90: rgb(0 201 80);
    --sentiment-80: rgb(124 207 0);
    --sentiment-70: rgb(240 177 0);
    --sentiment-60: rgb(254 154 0);
    --sentiment-50: rgb(255 105 0);
  }

  .template-avatar.avatar-reputation::after {
    outline-color: white;
  }

  .template-avatar.avatar-selected:not(.greyed-out) {
    box-shadow: 0 0 0 0.1rem rgba(237, 53, 203, 0.5);
  }
}

div[class*='avatar-reputation'] {
  position: relative;

  &::after {
    content: '';
    position: absolute;
  }

  &[data-vote-ratio='50']::after {
    background: var(--sentiment-50);
  }

  &[data-vote-ratio='60']::after {
    background: var(--sentiment-60);
  }

  &[data-vote-ratio='70']::after {
    background: var(--sentiment-70);
  }

  &[data-vote-ratio='80']::after {
    background: var(--sentiment-80);
  }

  &[data-vote-ratio='90']::after {
    background: var(--sentiment-90);
  }
}
</style>
