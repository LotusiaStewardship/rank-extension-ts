<script lang="ts" setup>
/** Vue components */
import QRCode from 'qrcode-vue3'
/** Modules and types */
import options from '@/assets/qroptions.json'
/** Vue props and emits */
const props = defineProps<{
  address: string
}>()

/**
 * Reactive state
 */
const showCopiedIndicator = shallowRef(false)

/**
 * Functions
 */
async function copyAddressToClipboard() {
  try {
    await navigator.clipboard.writeText(props.address)
    showCopiedIndicator.value = true

    setTimeout(() => {
      showCopiedIndicator.value = false
    }, 2000)
  } catch (error) {
    console.error('Failed to copy address to clipboard:', error)
  }
}
</script>
<template>
  <div class="py-2 px-6 space-y-4">
    <div>
      <h4 class="text-base font-semibold text-foreground">Receive Lotus</h4>
      <p class="text-sm text-muted-foreground mt-1 leading-relaxed">
        This QR code is your Lotus address. Friends can scan this code to give you
        Lotus directly to your wallet. They cannot use this code to take your
        Lotus without your consent.
      </p>
    </div>

    <p class="text-sm text-muted-foreground leading-relaxed">
      You can also click or tap the QR code to copy your Lotus address and share
      it via email, text, or other messaging apps.
    </p>

    <!-- QR Code Section -->
    <div class="flex justify-center">
      <div class="relative inline-flex flex-col items-center">
        <div
          class="rounded-xl bg-white p-3 shadow-elevation-2 cursor-pointer"
          @click="copyAddressToClipboard"
          role="button"
          tabindex="0"
          aria-label="Copy Lotus address to clipboard"
          @keydown.enter="copyAddressToClipboard"
          @keydown.space.prevent="copyAddressToClipboard"
        >
          <QRCode
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

        <!-- Tooltip-style copy indicator -->
        <Transition name="tooltip">
          <div
            v-if="showCopiedIndicator"
            class="absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full px-2.5 py-1 rounded-md bg-foreground text-background text-xs font-medium shadow-elevation-3 whitespace-nowrap pointer-events-none z-10"
          >
            <div class="flex items-center gap-1">
              <span>Address copied!</span>
            </div>
            <div class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-foreground rotate-45" />
          </div>
        </Transition>
      </div>
    </div>

    <!-- Disclaimer -->
    <p class="text-xs text-amber-600 dark:text-amber-400 leading-relaxed bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3">
      <span class="font-medium">Privacy notice:</span> Sharing your address with
      others will allow them to see how you vote in Lotusia. Use discretion when
      sharing your address if privacy is a concern.
    </p>
  </div>
</template>

<style scoped>
.tooltip-enter-active,
.tooltip-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.tooltip-enter-from {
  opacity: 0;
  transform: translate(-50%, calc(-100% + 4px));
}

.tooltip-leave-to {
  opacity: 0;
  transform: translate(-50%, calc(-100% - 4px));
}

@media (prefers-reduced-motion: reduce) {
  .tooltip-enter-active,
  .tooltip-leave-active {
    transition: none;
  }
  .tooltip-enter-from,
  .tooltip-leave-to {
    opacity: 1;
    transform: translate(-50%, -100%);
  }
}
</style>
