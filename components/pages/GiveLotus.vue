<script setup lang="ts">
/** Vue components */
import { FwbButton, FwbInput, FwbHeading } from 'flowbite-vue'
import AddressScanButton from '../buttons/AddressScanButton.vue'
/** Modules and type imports */
import { walletMessaging } from '@/entrypoints/background/messaging'
import { WalletTools } from '@/entrypoints/background/modules/wallet'
import {
  DEFAULT_EXPLORER_URL,
  WALLET_LOTUS_DECIMAL_PRECISION,
} from '@/utils/constants'
/**
 * Local types
 */
/** Input data for the give Lotus form */
export type GiveLotusInputData = {
  /** Destination Lotus address */
  outAddress: string
  /** Amount of Lotus to send */
  outValue: number
}
/** Result of the give Lotus operation */
export type GiveLotusResult = {
  success: boolean
  txid?: string
  error?: string
}
/**
 * Constants
 */
const outAddress = shallowRef('')
const outValue = shallowRef('')
const sendLotusResult = ref({} as GiveLotusResult)
const sending = shallowRef(false)
/**
 * Vue props
 */
const props = defineProps<{
  spendableBalance: string
}>()
/**
 * Vue computed properties
 */
const spendableBalanceXPI = computed(() => toLotusUnits(props.spendableBalance).toString().split('.')[0])
const spendableBalanceDecimal = computed(() => toLotusUnits(props.spendableBalance).toString().split('.')[1])
const isInputDataValid = computed(() => outValueValidationStatus.value === 'success' && outAddressValidationStatus.value === 'success')
/** Input field validation enforcing Lotus address using bitcore-lib */
const outAddressValidationStatus = computed(() => {
  if (WalletTools.isValidAddress(outAddress.value)) {
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
  sendLotusResult.value = {} as GiveLotusResult
}
/** Reset entire form */
function resetForm() {
  outAddress.value = ''
  outValue.value = ''
  sending.value = false
}
/**
 * Message the background `WalletManager` handler to send the `outValue` amount of Lotus
 * to the `outAddress` destination
 * @param outAddress Lotus address to receive the `outValue` of Lotus
 * @param outValue Total amount of Lotus to send, in Lotus units
 */
async function giveLotus({ outAddress, outValue }: GiveLotusInputData) {
  resetGiveLotusResult()
  sending.value = true
  const txidOrError = await walletMessaging.sendMessage('popup:sendLotus', {
    outAddress,
    outValue,
  })
  if (!isSha256(txidOrError)) {
    sendLotusResult.value = {
      success: false,
      error: txidOrError,
    }
    sending.value = false
    return
  }
  sendLotusResult.value = {
    success: true,
    txid: txidOrError,
  }
  resetForm()
}
/** Boolean conditional to enable submit buttion if all form data is valid */
// function isInputDataValid() {
//   return inputValidated.value.outAddress && inputValidated.value.outValue
// }
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
    <FwbHeading color="dark:text-white" tag="h4"> Give Lotus </FwbHeading>
    <div class="py-2 flex">
      <div class="flex-grow">
        <FwbInput v-model="outAddress" :disabled="sending" :validation-status="outAddressValidationStatus"
          label="Friend's Lotus address">
          <template #helper>
            Copy and paste your friend's Lotus address here<!--, or click/tap the
            camera button to scan their QR code-->
          </template>
          <!--
          <template #suffix>
            <div class="flex-grow right-0">
              <AddressScanButton @click="openScanner" />
            </div>
          </template>
          -->
        </FwbInput>
      </div>
    </div>
    <div class="py-2">
      <FwbInput v-model="outValue" :disabled="sending" :validation-status="outValueValidationStatus"
        label="Amount of Lotus to Give" type="number">
        <template #suffix>
          <FwbButton disabled color="pink" :outline="true" size="md"
            class="text-xs font-medium text-pink-500 hover:bg-pink-50 dark:hover:bg-pink-900/20 dark:text-pink-400">
            Give All
          </FwbButton>
        </template>
      </FwbInput>
    </div>
    <div class="py-2 flex justify-between items-center">
      <div>
        <FwbButton color="pink" size="sm" :disabled="!isInputDataValid || sending" :outline="true"
          @click="giveLotus({ outAddress, outValue: toSatoshiUnits(outValue) })">Give Now</FwbButton>
      </div>
      <div>
        <span class="text-sm text-pink-500 dark:text-pink-300">
          {{ spendableBalanceXPI }}.<span class="text-xs text-pink-500 dark:text-pink-300">{{ spendableBalanceDecimal
            }}</span>
          XPI spendable
        </span>
      </div>
    </div>
    <div class="py-2">
      <template v-if="sendLotusResult.success === true">
        <div
          class="flex items-center p-4 mb-4 text-sm text-purple-800 border border-purple-5400 rounded bg-purple-50 dark:bg-gray-800 dark:text-purple-300 dark:border-purple-400"
          role="alert">
          <svg class="shrink-0 inline w-4 h-4 me-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"
            fill="currentColor" viewBox="0 0 20 20">
            <path
              d="M10 .5a9.5 9.5 0 1 0 9.5 9.5A9.51 9.51 0 0 0 10 .5ZM9.5 4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM12 15H8a1 1 0 0 1 0-2h1v-3H8a1 1 0 0 1 0-2h2a1 1 0 0 1 1 1v4h1a1 1 0 0 1 0 2Z" />
          </svg>
          <span class="sr-only">Info</span>
          <div>
            <span class="font-medium">Lotus given successfully!</span>&nbsp;
            <span>
              (<a target="_blank" class="text-pink-500 dark:text-pink-300"
                :href="DEFAULT_EXPLORER_URL + '/tx/' + sendLotusResult.txid">View technical details</a>)
            </span>
          </div>
          <button type="button"
            class="ms-auto -mx-1.5 -my-1.5 bg-purple-50 text-purple-500 rounded focus:ring-2 focus:ring-purple-400 p-1.5 hover:bg-purple-200 inline-flex items-center justify-center h-8 w-8 dark:bg-gray-800 dark:text-purple-300"
            @click="resetGiveLotusResult" aria-label="Close">
            <span class="sr-only">Close</span>
            <svg class="w-3 h-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 14 14">
              <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="m1 1 6 6m0 0 6 6M7 7l6-6M7 7l-6 6" />
            </svg>
          </button>
        </div>
      </template>
      <template v-else-if="sendLotusResult.success === false">
        <div
          class="flex items-center p-4 mb-4 text-sm text-purple-800 border border-purple-5400 rounded bg-purple-50 dark:bg-gray-800 dark:text-purple-300 dark:border-purple-400"
          role="alert">
          <svg class="shrink-0 inline w-4 h-4 me-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"
            fill="currentColor" viewBox="0 0 20 20">
            <path
              d="M10 .5a9.5 9.5 0 1 0 9.5 9.5A9.51 9.51 0 0 0 10 .5ZM9.5 4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM12 15H8a1 1 0 0 1 0-2h1v-3H8a1 1 0 0 1 0-2h2a1 1 0 0 1 1 1v4h1a1 1 0 0 1 0 2Z" />
          </svg>
          <span class="sr-only">Info</span>
          <div>
            <span class="font-medium">Error:</span>&nbsp;&nbsp;
            <span>
              {{ sendLotusResult.error }}
            </span>
          </div>
          <button type="button"
            class="ms-auto -mx-1.5 -my-1.5 bg-purple-50 text-purple-500 rounded focus:ring-2 focus:ring-purple-400 p-1.5 hover:bg-purple-200 inline-flex items-center justify-center h-8 w-8 dark:bg-gray-800 dark:text-purple-300"
            @click="resetGiveLotusResult" aria-label="Close">
            <span class="sr-only">Close</span>
            <svg class="w-3 h-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 14 14">
              <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="m1 1 6 6m0 0 6 6M7 7l6-6M7 7l-6 6" />
            </svg>
          </button>
        </div>
      </template>
    </div>
  </div>
</template>
