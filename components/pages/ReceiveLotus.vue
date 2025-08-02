<script lang="ts" setup>
/** Vue components */
import QRCode from 'qrcode-vue3'
import { FwbP, FwbHeading } from 'flowbite-vue'
/** Modules and types */
import options from '@/assets/qroptions.json'
/** Vue props and emits */
const props = defineProps<{
  address: string
}>()

/**
 * Constants
 */

/**
 * Reactive state
 */
const showCopiedIndicator = shallowRef(false)

/**
 * Functions
 */
async function copyAddressToClipboard() {
  try {
    // most important part
    await navigator.clipboard.writeText(props.address)
    // fancy visual feedback
    showCopiedIndicator.value = true

    // Hide the indicator after 2 seconds
    setTimeout(() => {
      showCopiedIndicator.value = false
    }, 2000)
  } catch (error) {
    console.error('Failed to copy address to clipboard:', error)
  }
}
/**
 * Vue lifecycle hooks
 */
</script>
<template>
  <div class="py-2 px-6">
    <FwbHeading class="pb-2" color="dark:text-white" tag="h4">
      Receive Lotus
    </FwbHeading>
    <FwbP>
      This QR code is your Lotus address. Friends can scan this code to give you
      Lotus directly to your wallet. They cannot use this code to take your
      Lotus without your consent.
    </FwbP>
    <FwbP>You can also click/tap the QR code to copy your Lotus address to share
      via email, text, etc.</FwbP>
    <FwbP class="text-yellow-600 dark:text-yellow-300">
      BE ADVISED: Sharing your address with others will allow them to see how
      you vote in Lotusia. Use discretion when sharing your address if privacy
      is a concern.
    </FwbP>
    <div class="relative flex justify-center">
      <div id="qr-code-wrapper" @click="copyAddressToClipboard">
        <QRCode class="qr-code" :value="props.address" :height="options.height" :width="options.width"
          :corners-square-options="options.cornersSquareOptions" :corners-dot-options="options.cornersDotOptions"
          :image-options="options.imageOptions" :dots-options="options.dotsOptions" :qr-options="options.qrOptions"
          :background-options="options.backgroundOptions" />
        <!-- Copy success indicator -->
        <div v-if="showCopiedIndicator" class="copy-indicator absolute inset-0 flex items-center justify-center">
          <span class="text-sm text-green-200 dark:text-green-200 font-medium">✓
            Address copied!</span>
        </div>
      </div>

    </div>
  </div>
</template>
<style lang="css" scoped>
#qr-code-wrapper:hover {
  cursor: pointer;
  left: 50%;
}

.pb-2 {
  padding-bottom: 0.5rem;
}

.text-md {
  font-size: 1rem;
  line-height: 1.45rem;
}

.copy-indicator {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background-color: rgba(0, 0, 0, 0.69);
  width: 66%;
  height: 20%;
  border-radius: 0.5rem;
}

.qr-code {
  padding: 1em 1em;
}
</style>
