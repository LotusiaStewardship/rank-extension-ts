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
 * Functions
 */
function copyAddressToClipboard() {
  // most important part
  navigator.clipboard.writeText(props.address)
  // fancy visual feedback
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
    <FwbP
      >You can also click/tap the QR code to copy your Lotus address to share
      via email, text, etc.</FwbP
    >
    <FwbP class="text-yellow-600 dark:text-yellow-300">
      BE ADVISED: Sharing your address with others will allow them to see how
      you vote in Lotusia. Use discretion when sharing your address if privacy
      is a concern.
    </FwbP>
    <div id="qr-code-wrapper" @click="copyAddressToClipboard">
      <QRCode
        class="qr-code"
        :value="props.address"
        :height="options.height"
        :width="options.width"
        :corners-square-options="options.cornersSquareOptions"
        :corners-dot-options="options.cornersDotOptions"
        :image-options="options.imageOptions"
        :dots-options="options.dotsOptions"
        :qr-options="options.qrOptions"
        :background-options="options.backgroundOptions"
      />
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
.qr-code {
  padding: 1em 1em;
}
div {
  place-items: center;
}
</style>
