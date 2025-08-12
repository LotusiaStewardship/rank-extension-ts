<script setup lang="ts">
/** Vue components */
import { FwbButton, FwbInput, FwbHeading } from 'flowbite-vue'
import LoadingSpinnerMessage from '@/components/LoadingSpinnerMessage.vue'
import GiveLotusConsolidateWalletForm from '@/components/forms/GiveLotusConsolidateWalletForm.vue'
import GiveLotusResult from '@/components/pages/give/GiveLotusResult.vue'
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
const needsUtxoConsolidation = shallowRef<boolean | null>(null)
const giveLotusTxid = shallowRef<string | null>(null)
const giveLotusError = shallowRef<string | null>(null)
const processing = shallowRef(false)
/**
 * Vue computed properties
 */
const initialized = computed(() =>
  needsUtxoConsolidation.value !== null &&
  Number(props.spendableBalance) > 0
)
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
  giveLotusTxid.value = null
  giveLotusError.value = null
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
    giveLotusError.value = txidOrError
    processing.value = false
    return
  }
  giveLotusTxid.value = txidOrError
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
/**
 * Vue lifecycle hooks
 */
onMounted(async () => {
  // ask the wallet if UTXO consolidation is needed
  needsUtxoConsolidation.value = await sendMessage(
    'popup:needsUtxoConsolidation',
    undefined,
  )
})
</script>

<template>
  <div class="py-2 px-6">
    <FwbHeading color="dark:text-white" tag="h4"> Give Lotus </FwbHeading>
    <LoadingSpinnerMessage v-if="!initialized" message="Loading wallet..." />
    <GiveLotusConsolidateWalletForm v-else-if="needsUtxoConsolidation" />
    <template v-else>
      <div class="py-2 flex">
        <div class="flex-grow">
          <FwbInput v-model="outAddress" :disabled="processing" :validation-status="outAddressValidationStatus"
            label="Friend's Lotus address">
            <template #helper>
              Copy and paste your friend's Lotus address here
              <!--, or click/tap the
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
        <FwbInput v-model="outValue" :disabled="processing" :validation-status="outValueValidationStatus"
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
          <FwbButton color="pink" size="sm" :disabled="!isInputDataValid || processing" :outline="true"
            @click="giveLotus">
            Give Now</FwbButton>
        </div>
        <div>
          <span class="text-sm text-pink-500 dark:text-pink-300">
            {{ spendableBalanceXPI }}.<span class="text-xs text-pink-500 dark:text-pink-300">{{ spendableBalanceDecimal
            }}</span>
            XPI spendable
          </span>
        </div>
      </div>
      <LoadingSpinnerMessage v-show="processing" message="Processing..." />
      <GiveLotusResult :txid="giveLotusTxid" :error="giveLotusError" @reset="resetGiveLotusResult" />
    </template>
  </div>
</template>
