import { WalletManager, WalletBuilder } from '@/entrypoints/background/modules/wallet'
import { WalletState, walletStore } from '@/entrypoints/background/stores'
import { walletMessaging } from '@/entrypoints/background/messaging'
import assert from 'assert'

let walletManager = new WalletManager()

const initWalletManager = async (walletState?: WalletState) => {
  walletState ||= (await walletStore.loadWalletState()) as WalletState
  // Parse new or existing wallet state into usable wallet objects
  await walletManager.init(walletState)
  console.log('initialized wallet manager')
}

const validateWalletMessageSender = (senderId?: string) => {
  assert(senderId, 'there is no sender ID to validate, will not proceed')
  assert(
    senderId === browser.runtime.id,
    `sender ID "${senderId}" does not match our extension ID ${browser.runtime.id}`,
  )
  return true
}

export default defineBackground({
  persistent: true,
  type: 'module',
  main: () => {
    walletMessaging.onMessage(
      'popup:seedPhrase',
      async ({ sender, data: seedPhrase }) => {
        try {
          validateWalletMessageSender(sender.id)
          // Build a new wallet state from the generated seed phrase
          const walletState = WalletBuilder.buildWalletState(seedPhrase)
          // Save the new wallet into local storage
          await walletStore.saveWalletState(walletState)
          await initWalletManager(walletState)
          // Send the new wallet details to the popup UI
          // TODO: Return the wallet state to popup UI directly without messaging API
          return await walletMessaging.sendMessage(
            'background:walletState',
            walletManager.uiWalletState,
          )
        } catch (e) {
          console.error(e)
        }
      },
    )
    /**  */
    walletMessaging.onMessage('popup:loadWalletState', async ({ sender }) => {
      try {
        validateWalletMessageSender(sender.id)
        return await walletMessaging.sendMessage(
          'background:walletState',
          walletManager.uiWalletState,
        )
      } catch (e) {
        console.error(e)
      }
    })
    /**  */
    walletMessaging.onMessage('popup:sendLotus', async ({ sender, data }) => {
      try {
        validateWalletMessageSender(sender.id)
        return (await walletManager.handlePopupSendLotus(data)) as string
      } catch (e) {
        console.error(`error during 'popup:sendLotus':`, e)
      }
      return null
    })
    /**  */
    walletMessaging.onMessage(
      'content-script:submitRankVote',
      async ({ sender, data }) => {
        try {
          validateWalletMessageSender(sender.id)
          return (await walletManager.handlePopupSubmitRankVote(data)) as string
        } catch (e: any) {
          console.error(`error during 'content-script:submitRankVote':`, e)
        }
        return null
      },
    )
    /**  */
    walletMessaging.onMessage('popup:loadSeedPhrase', async ({ sender }) => {
      validateWalletMessageSender(sender.id)
      return walletManager.seedPhrase
    })
    // Load wallet state, or open popup ui to generate seed for new wallet state
    initWalletManager().catch(() => browser.action.openPopup())
  },
})
