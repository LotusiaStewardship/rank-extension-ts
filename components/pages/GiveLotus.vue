<script setup lang="ts">
/** Vue components */
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import LoadingSpinnerMessage from '@/components/LoadingSpinnerMessage.vue'
import GiveLotusResult from '@/components/pages/give/GiveLotusResult.vue'
import GiveLotusEmptyWallet from '@/components/pages/give/GiveLotusEmptyWallet.vue'
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
    <h4 class="text-foreground">Give Lotus</h4>
    <GiveLotusEmptyWallet v-if="spendableBalance === '0'" />
    <!-- <GiveLotusConsolidateWallet v-else-if="needsUtxoConsolidation" /> -->
    <template v-else>
      <!-- Friend's Lotus address -->
      <div class="py-2 flex">
        <div class="flex-grow">
          <div class="space-y-1">
            <label class="text-sm font-medium text-foreground">Friend's Lotus address</label>
            <Input v-model="outAddress" :disabled="processing"
              :class="{
                'border-destructive': outAddressValidationStatus === 'error',
                'border-emerald-500 dark:border-emerald-400': outAddressValidationStatus === 'success'
              }"
              placeholder="Copy and paste your friend's Lotus address here" />
          </div>
        </div>
      </div>
      <!-- Amount of Lotus to Give -->
      <div class="py-2 flex">
        <div class="flex-grow">
          <div class="space-y-1">
            <label class="text-sm font-medium text-foreground">Amount of Lotus to Give</label>
            <div class="flex gap-2 items-start">
              <Input v-model="outValue" :disabled="processing" type="number"
                :class="{
                  'border-destructive': outValueValidationStatus === 'error',
                  'border-emerald-500 dark:border-emerald-400': outValueValidationStatus === 'success'
                }"
                class="flex-1" />
              <button
                disabled
                class="text-xs font-medium text-pink-500 dark:text-pink-400 underline underline-offset-2 decoration-pink-300 dark:decoration-pink-700 hover:text-pink-700 dark:hover:text-pink-200 disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed transition-colors shrink-0 self-start mt-1"
              >
                Give All
              </button>
            </div>
          </div>
        </div>
      </div>
      <!-- Give Now button and spendable balance -->
      <div class="py-2 flex justify-between items-center">
        <div>
          <Button variant="outline" size="sm" :disabled="!isInputDataValid || processing"
            class="text-primary border-primary hover:bg-primary/10 dark:hover:bg-primary/20"
            @click="giveLotus">
            Give Now</Button>
        </div>
        <div class="text-right">
          <p class="text-lg font-semibold text-primary">
            {{ spendableBalanceXPI }}.<span class="text-sm">{{ spendableBalanceDecimal }}</span>
          </p>
          <p class="text-xs text-muted-foreground leading-tight">XPI spendable</p>
        </div>
      </div>
      <!-- Loading spinner and result -->
      <LoadingSpinnerMessage v-show="processing" message="Processing..." />
      <GiveLotusResult :txid="giveTxid" :error="giveError" @reset="resetGiveLotusResult" />
    </template>
  </div>
</template>
