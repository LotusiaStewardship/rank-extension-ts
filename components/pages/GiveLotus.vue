<script setup lang="ts">
/** Vue components */
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import LoadingSpinnerMessage from '@/components/LoadingSpinnerMessage.vue'
import GiveLotusResult from '@/components/pages/give/GiveLotusResult.vue'
import GiveLotusEmptyWallet from '@/components/pages/give/GiveLotusEmptyWallet.vue'
import AddressScanButton from '../buttons/AddressScanButton.vue'
/** Modules and type imports */
import { walletMessaging } from '@/entrypoints/background/messaging'
import { WalletTools } from '@/entrypoints/background/modules/wallet'
/**
 * Vue definitions
 */
const props = defineProps<{
  spendableBalance: string
}>()
/**
 * Constants
 */
const { isValidAddress } = WalletTools
const { sendMessage } = walletMessaging
const outAddress = shallowRef('')
const outValue = shallowRef('')
const giveTxid = shallowRef<string | null>(null)
const giveError = shallowRef<string | null>(null)
const processing = shallowRef(false)
/**
 * Vue computed properties
 */
const spendableBalanceXPI = computed(() => toLotusUnits(props.spendableBalance).toString().split('.')[0])
const spendableBalanceDecimal = computed(() => toLotusUnits(props.spendableBalance).toString().split('.')[1])
const isInputDataValid = computed(() => outValueValidationStatus.value === 'success' && outAddressValidationStatus.value === 'success')
/** Input field validation enforcing Lotus address using bitcore-lib */
const outAddressValidationStatus = computed(() => {
  if (isValidAddress(outAddress.value)) {
    return 'success'
  }
  if (outAddress.value.length > 0) {
    return 'error'
  }
  return
})
/** Input field validation enforcing balance and decimal units */
const outValueValidationStatus = computed(() => {
  const outValueStr = outValue.value.toString()
  // split and validate float if necessary
  if (outValueStr.includes('.')) {
    // split float precision
    const [int, float] = outValueStr.split('.')
    if (float.length > WALLET_LOTUS_DECIMAL_PRECISION) {
      // truncate input field value
      const floatTrunc = float.slice(0, WALLET_LOTUS_DECIMAL_PRECISION)
      outValue.value = `${int}.${floatTrunc}`
      return
    }
  }
  // enforce 6 decimal places
  const outValueInt = Number(outValue.value)
  const spendableBalanceInt = toLotusUnits(props.spendableBalance)
  if (outValueInt > 0 && outValueInt <= spendableBalanceInt) {
    return 'success'
  }
  if (outValue.value.length > 0) {
    return 'error'
  }
  return
})
/**
 * Functions
 */
/** Clear state for previous give operation */
function resetGiveLotusResult() {
  giveTxid.value = null
  giveError.value = null
}
/** Reset entire form */
function resetForm() {
  outAddress.value = ''
  outValue.value = ''
  processing.value = false
}
/**
 * Message the background `WalletManager` handler to send the `outValue` amount of Lotus
 * to the `outAddress` destination
 */
async function giveLotus() {
  resetGiveLotusResult()
  processing.value = true
  const txidOrError = await sendMessage('popup:sendLotus', {
    outAddress: outAddress.value,
    outValue: toSatoshiUnits(outValue.value),
  })
  // processing is done, but keep form data if there was an error
  if (!isSha256(txidOrError)) {
    giveError.value = txidOrError
    processing.value = false
    return
  }
  giveTxid.value = txidOrError
  resetForm()
}
/**
 * Open the camera to scan a Lotus address
 */
async function openScanner() {
  const device = await navigator.mediaDevices.getUserMedia({
    video: true,
  })
  const videoTracks = device.getVideoTracks()
  videoTracks.map(track => console.log(track))
}
</script>

<template>
  <div class="py-2 px-6">
    <h4 class="dark:text-white">Give Lotus</h4>
    <GiveLotusEmptyWallet v-if="spendableBalance === '0'" />
    <!-- <GiveLotusConsolidateWallet v-else-if="needsUtxoConsolidation" /> -->
    <template v-else>
      <!-- Friend's Lotus address -->
      <div class="py-2 flex">
        <div class="flex-grow">
          <div class="space-y-1">
            <label class="text-sm font-medium text-gray-900 dark:text-white">Friend's Lotus address</label>
            <Input v-model="outAddress" :disabled="processing"
              :class="{
                'border-red-500 dark:border-red-400': outAddressValidationStatus === 'error',
                'border-green-500 dark:border-green-400': outAddressValidationStatus === 'success'
              }"
              placeholder="Copy and paste your friend's Lotus address here" />
          </div>
        </div>
      </div>
      <!-- Amount of Lotus to Give -->
      <div class="py-2 flex">
        <div class="flex-grow">
          <div class="space-y-1">
            <label class="text-sm font-medium text-gray-900 dark:text-white">Amount of Lotus to Give</label>
            <div class="flex gap-2 items-start">
              <Input v-model="outValue" :disabled="processing" type="number"
                :class="{
                  'border-red-500 dark:border-red-400': outValueValidationStatus === 'error',
                  'border-green-500 dark:border-green-400': outValueValidationStatus === 'success'
                }"
                class="flex-1" />
              <Button disabled variant="outline" size="default"
                class="text-xs font-medium text-pink-500 hover:bg-pink-50 dark:hover:bg-pink-900/20 dark:text-pink-400 border-pink-500">
                Give All
              </Button>
            </div>
          </div>
        </div>
      </div>
      <!-- Give Now button and spendable balance -->
      <div class="py-2 flex justify-between items-center">
        <div>
          <Button variant="outline" size="sm" :disabled="!isInputDataValid || processing"
            class="text-pink-600 border-pink-600 hover:bg-pink-50 dark:text-pink-400 dark:border-pink-400 dark:hover:bg-pink-950"
            @click="giveLotus">
            Give Now</Button>
        </div>
        <div class="text-pink-500 dark:text-pink-300">
          <span class="text-sm">
            {{ spendableBalanceXPI }}.<span class="text-xs">{{ spendableBalanceDecimal }}</span>
            XPI spendable
          </span>
        </div>
      </div>
      <!-- Loading spinner and result -->
      <LoadingSpinnerMessage v-show="processing" message="Processing..." />
      <GiveLotusResult :txid="giveTxid" :error="giveError" @reset="resetGiveLotusResult" />
    </template>
  </div>
</template>
