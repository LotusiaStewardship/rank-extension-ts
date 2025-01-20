import { UIWalletState } from '@/entrypoints/background/stores'
import { defineExtensionMessaging } from '@webext-core/messaging'
import type { ScriptChunkPlatformUTF8, ScriptChunkSentimentUTF8 } from 'rank-lib'

interface WalletMessaging {
  'background:walletState': (walletState: UIWalletState) => void
  'popup:seedPhrase': (seedPhrase: string) => void
  'popup:loadWalletState': () => void
  'popup:sendLotus': ({
    outAddress,
    outValue,
  }: {
    outAddress: string
    outValue: number
  }) => void
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
  }) => Promise<string | null>
}

const walletMessaging = defineExtensionMessaging<WalletMessaging>()
export { walletMessaging }
