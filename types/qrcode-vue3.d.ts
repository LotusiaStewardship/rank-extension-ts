/**
 * Typed boundary for `qrcode-vue3` (DEV-396).
 *
 * The package ships untypechecked `.ts` sources that `vue-tsc` pulls into the
 * program through its `src/index.d.ts`, producing 15 errors inside
 * `node_modules`. This declaration replaces that resolution: `tsconfig.json`
 * maps `qrcode-vue3` here through `paths`, so only this file is type-checked.
 * Runtime resolution is untouched (vite still loads the package from
 * `node_modules`), which is why the bundles do not change.
 *
 * The option shapes mirror the package's own `Options` type
 * (`src/core/QROptions.ts`) widened to accept what `assets/qroptions.json`
 * actually passes: string values for `typeNumber`, `mode`,
 * `errorCorrectionLevel`, and the style `type` fields. Third-party code; types
 * only, no runtime behaviour of the package is declared here.
 */
import type { DefineComponent } from 'vue'

type QRCodeGradient = {
  type?: string
  rotation?: number
  colorStops?: { offset: number; color: string }[]
}

type QRCodeProps = {
  value: string
  width?: number
  height?: number
  margin?: number
  imgclass?: string
  myclass?: string
  downloadButton?: string
  buttonName?: string
  qrOptions?: {
    typeNumber?: number | string
    mode?: string
    errorCorrectionLevel?: string
  }
  imageOptions?: {
    hideBackgroundDots?: boolean
    imageSize?: number
    crossOrigin?: string
    margin?: number
    saveAsBlob?: boolean
  }
  dotsOptions?: {
    type?: string
    color?: string
    gradient?: QRCodeGradient
    roundSize?: boolean
  }
  backgroundOptions?: {
    color?: string
    gradient?: QRCodeGradient
    round?: number
  }
  cornersSquareOptions?: {
    type?: string
    color?: string
    gradient?: QRCodeGradient
  }
  cornersDotOptions?: {
    type?: string
    color?: string
    gradient?: QRCodeGradient
  }
  fileExt?: string
  image?: string
  download?: boolean
  downloadOptions?: { name?: string; extension?: string }
}

declare const QRCode: DefineComponent<QRCodeProps>
export default QRCode
