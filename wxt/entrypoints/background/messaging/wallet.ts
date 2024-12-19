import { LoadedWalletState } from '@/entrypoints/background/stores'
import { defineExtensionMessaging } from '@webext-core/messaging'

interface WalletMessaging {
  seedPhrase: (seedPhrase: string) => void
  walletState: (walletState: LoadedWalletState) => void
  loadWalletState: () => void
}

const walletMessaging = defineExtensionMessaging<WalletMessaging>()
export { walletMessaging }
