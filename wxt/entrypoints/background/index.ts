import { WalletManager, WalletBuilder } from '@/entrypoints/background/modules/wallet'
import { WalletState, walletStore } from '@/entrypoints/background/stores'
import { walletMessaging } from '@/entrypoints/background/messaging'
import assert from 'assert'

let walletManager = new WalletManager()

const initWalletManager = async (walletState?: WalletState) => {
  walletState ||= (await walletStore.loadWalletState()) as WalletState
  // Initialize the WalletManager with this new wallet state
  walletManager.init(walletState)
  // Connect to Chronik websocket
  await walletManager.wsWaitForOpen()
  // Subscribe to websocket for deposits and such
  walletManager.wsSubscribeP2PKH(walletManager.scriptPayload)
  // Process the UTXO set for our wallet
  walletManager.fetchScriptUtxoSet()
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
        } catch (e) {}
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
    console.log('Hello background!', { id: browser.runtime.id })
    // Load wallet state, or open popup ui to generate seed for new wallet state
    initWalletManager().catch(() => browser.action.openPopup())
  },
})
