import { WalletManager, WalletBuilder } from '@/entrypoints/background/modules/wallet'
import { walletStore } from '@/entrypoints/background/stores'
import { walletMessaging } from '@/entrypoints/background/messaging'
import assert from 'assert'

export default defineBackground({
  persistent: true,
  type: 'module',
  main: () => {
    /** Instantiated `WalletManager` used during background service-worker runtime */
    const walletManager = new WalletManager()
    /**
     * Initialize the `WalletManager` with provided `WalletState`, or load existing `WalletState` from local storage
     * @param walletState If this is set, it is the `WalletState` returned by `WalletBuilder.buildWalletState`
     */
    const initWalletManager = async () => {
      // Parse new or existing wallet state into usable wallet objects
      await walletManager.init()
      console.log('initialized wallet manager')
    }
    /**
     * Validate if this extension requests background service-worker action
     * @param senderId The ID of the message sender, usually extension ID
     * @returns {boolean} `true` if the message sender is valid, `false` otherwise
     */
    const validateWalletMessageSender = (senderId?: string): boolean => {
      assert(senderId, 'there is no sender ID to validate, will not proceed')
      assert(
        senderId === browser.runtime.id,
        `sender ID "${senderId}" does not match our extension ID ${browser.runtime.id}`,
      )
      return true
    }
    /**  */
    walletMessaging.onMessage(
      'popup:seedPhrase',
      async ({ sender, data: seedPhrase }) => {
        try {
          validateWalletMessageSender(sender.id)
          // Build a new wallet state from the generated seed phrase
          const walletState = WalletBuilder.buildWalletState(seedPhrase)
          // Save the new wallet into local storage
          await walletStore.saveWalletState(walletState)
          await initWalletManager()
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (e: any) {
        throw new Error(`error during 'popup:sendLotus': ${e.message}`)
      }
    })
    /**  */
    walletMessaging.onMessage(
      'content-script:submitRankVote',
      async ({ sender, data }) => {
        try {
          validateWalletMessageSender(sender.id)
          return (await walletManager.handlePopupSubmitRankVote(data)) as string
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (e: any) {
          throw new Error(
            `error during 'content-script:submitRankVote': ${e.message}`,
          )
        }
      },
    )
    /**  */
    walletMessaging.onMessage(
      'content-script:getScriptPayload',
      async ({ sender, data }) => {
        try {
          validateWalletMessageSender(sender.id)
          return walletManager.scriptPayload
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (e: any) {
          throw new Error(
            `error during 'content-script:getScriptPayload': ${e.message}`,
          )
        }
      },
    )
    /**  */
    walletMessaging.onMessage('popup:loadSeedPhrase', async ({ sender }) => {
      try {
        validateWalletMessageSender(sender.id)
        return walletManager.seedPhrase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (e: any) {
        throw new Error(`error during 'popup:loadSeedPhrase': ${e.message}`)
      }
    })
    // Load wallet state, or open popup ui to generate seed for new wallet state
    initWalletManager().catch(() => browser.action.openPopup())
  },
})
