import type { UIWalletState } from '@/entrypoints/background/stores'
import { defineExtensionMessaging } from '@webext-core/messaging'
import type { RankOutput } from 'rank-lib'

interface WalletMessaging {
  'background:walletState': (walletState: UIWalletState) => void
  'popup:loadSigningKey': () => string
  'popup:loadSeedPhrase': () => string
  'popup:seedPhrase': (seedPhrase: string) => Promise<UIWalletState>
  'popup:loadWalletState': () => UIWalletState
  'popup:needsUtxoConsolidation': () => boolean
  'popup:sendLotus': ({
    outAddress,
    outValue,
  }: {
    outAddress: string
    outValue: number
  }) => Promise<string>
  'content-script:getScriptPayload': () => Promise<string>
  'content-script:submitRankVote': (outputs: RankOutput[]) => Promise<string>
}

const walletMessaging = defineExtensionMessaging<WalletMessaging>()
export { walletMessaging }
