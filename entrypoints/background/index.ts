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
          return await walletMessaging.sendMessage(
            'background:walletState',
            walletManager.uiWalletState,
          )
        } catch (e) {
          console.error(e)
        }
      },
    )
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
    walletMessaging.onMessage(
      'popup:sendLotus',
      async ({ sender, data: { outAddress, outValue } }) => {
        try {
          validateWalletMessageSender(sender.id)
          walletManager.queue.pending.push([
            walletManager.handlePopupSendLotus,
            {
              outAddress,
              outValue,
            },
          ])
          walletManager.resolveQueuedEventProcessors()
        } catch (e) {
          console.error(e)
        }
      },
    )
    walletMessaging.onMessage(
      'content-script:submitRankVote',
      async ({ sender, data }) => {
        try {
          validateWalletMessageSender(sender.id)
          // Return the txid to the content script
          let returnValue: string = ''
          const callback = (txid: string) => (returnValue = txid)
          walletManager.queue.pending.push([
            walletManager.handlePopupSubmitRankVote,
            data,
            callback,
          ])
          // TODO: this may prove to be very hacky.. may need to work in a different solution
          // Wait for queue to be fully resolved
          await walletManager.resolveQueuedEventProcessors()
          // Our callback has been executed; return the value we were waiting for
          return returnValue
        } catch (e) {
          console.error(e)
        }
        return null
      },
    )
    // Load wallet state, or open popup ui to generate seed for new wallet state
    initWalletManager().catch(() => browser.action.openPopup())
  },
})
