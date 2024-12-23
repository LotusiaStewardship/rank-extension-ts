import { UIWalletState } from '@/entrypoints/background/stores'
import { defineExtensionMessaging } from '@webext-core/messaging'

interface WalletMessaging {
  'background:walletState': (walletState: UIWalletState) => void
  'popup:loadWalletState': () => void
  'popup:sendLotus': ({
    outAddress,
    outValue,
  }: {
    outAddress: string
    outValue: number
  }) => void
}

const walletMessaging = defineExtensionMessaging<WalletMessaging>()
export { walletMessaging }
