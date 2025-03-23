<script lang="ts" setup>
import QRCode from 'qrcode-vue3'
import options from '@/assets/qroptions.json'
defineProps({
  address: String,
  renderAddressCaption: Boolean,
})

const emit = defineEmits(['qr-mounted'])
</script>
<template>
  <QRCode
    class="qr-code"
    :value="address!"
    :height="options.height"
    :width="options.width"
    :image="options.image"
    :corners-square-options="options.cornersSquareOptions"
    :corners-dot-options="options.cornersDotOptions"
    :image-options="options.imageOptions"
    :dots-options="options.dotsOptions"
    :qr-options="options.qrOptions"
    :background-options="options.backgroundOptions"
    @vue:mounted="emit('qr-mounted')"
  />
  <code v-if="renderAddressCaption">{{ address }}</code>
</template>
<style lang="css" scoped>
.qr-code {
  padding: 1em 1em;
}
</style>
