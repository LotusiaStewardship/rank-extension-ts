import { UIWalletState } from '@/entrypoints/background/stores'
import { defineExtensionMessaging } from '@webext-core/messaging'
import type { ScriptChunkPlatformUTF8, ScriptChunkSentimentUTF8 } from 'rank-lib'

interface WalletMessaging {
  'background:walletState': (walletState: UIWalletState) => void
  'popup:loadSeedPhrase': () => string
  'popup:seedPhrase': (seedPhrase: string) => Promise<UIWalletState>
  'popup:loadWalletState': () => UIWalletState
  'popup:sendLotus': ({
    outAddress,
    outValue,
  }: {
    outAddress: string
    outValue: number
  }) => Promise<string | void>
  'content-script:getScriptPayload': () => Promise<string>
  'content-script:submitRankVote': ({
    platform,
    profileId,
    sentiment,
    postId,
    comment,
  }: {
    platform: ScriptChunkPlatformUTF8
    profileId: string
    sentiment: ScriptChunkSentimentUTF8
    postId?: string
    comment?: string
  }) => Promise<string | void>
}

const walletMessaging = defineExtensionMessaging<WalletMessaging>()
export { walletMessaging }
