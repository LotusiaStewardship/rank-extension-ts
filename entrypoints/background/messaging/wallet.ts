import { defineExtensionMessaging } from '@webext-core/messaging'
import type { OutPoint } from 'chronik-client'
import type { RankOutput } from 'rank-lib'
import type { UIWalletState } from '@/entrypoints/background/stores'

interface WalletMessaging {
  'popup:loadSigningKey': () => string
  'popup:loadSeedPhrase': () => string
  'popup:loadWalletState': () => UIWalletState
  'popup:initializeWallet': (seedPhrase: string) => Promise<UIWalletState>
  'popup:needsUtxoConsolidation': () => boolean
  'popup:defragWallet': () => Promise<string[]>
  'popup:sendLotus': ({
    outAddress,
    outValue,
  }: {
    outAddress: string
    outValue: number
  }) => Promise<string>
  'content-script:getScriptPayload': () => Promise<string>
  'content-script:submitRankVote': ({
    ranks,
    voteAmountXPI,
  }: {
    ranks: RankOutput[]
    voteAmountXPI: string
  }) => Promise<string>
}

const walletMessaging = defineExtensionMessaging<WalletMessaging>()
export { walletMessaging }
