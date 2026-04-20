import { defineExtensionMessaging } from '@webext-core/messaging'
import type { MinerConfig, MinerStatus } from '@/entrypoints/background/stores'

interface MinerMessaging {
  'popup:minerLoadConfig': () => Promise<MinerConfig>
  'popup:minerSaveConfig': (config: MinerConfig) => Promise<MinerConfig>
  'popup:minerLoadStatus': () => Promise<MinerStatus>
  'popup:minerStart': () => Promise<MinerStatus>
  'popup:minerStop': () => Promise<MinerStatus>
}

const minerMessaging = defineExtensionMessaging<MinerMessaging>()
export { minerMessaging }
