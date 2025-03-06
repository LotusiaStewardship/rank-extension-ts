import { WalletManager, WalletBuilder } from '@/entrypoints/background/modules/wallet'
import { walletStore, instanceStore } from '@/entrypoints/background/stores'
import { walletMessaging } from '@/entrypoints/background/messaging'
import assert from 'assert'

export default defineBackground({
  persistent: true,
  type: 'module',
  main: () => {
    /** Instantiated `WalletManager` used during background service-worker runtime */
    const walletManager = new WalletManager()
    /**
     *
     *  Register Event Handlers
     *
     */
    /**  */
    walletMessaging.onMessage(
      'popup:seedPhrase',
      async ({ sender, data: seedPhrase }) => {
        validateWalletMessageSender(sender.id)
        // Build a new wallet state from the generated seed phrase
        const walletState = WalletBuilder.buildWalletState(seedPhrase)
        // Save the new wallet into local storage
        await walletStore.saveWalletState(walletState)
        await walletManager.init()
        // Create new instanceId before creating new wallet
        const instanceId = await newInstanceId(browser.runtime.id)
        await instanceStore.setInstanceId(instanceId)
        // Send the new wallet details to the popup UI
        // TODO: Return the wallet state to popup UI directly without messaging API
        return walletManager.uiWalletState
        /*
        return await walletMessaging.sendMessage(
          'background:walletState',
          walletManager.uiWalletState,
        )
        */
      },
    )
    /**  */
    walletMessaging.onMessage('popup:loadWalletState', ({ sender }) => {
      try {
        validateWalletMessageSender(sender.id)
        return walletManager.uiWalletState
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
    walletManager
      .init()
      .catch(async () => {
        browser.action.openPopup()
      })
      .then(() => console.log('initialized wallet manager'))
    /*
    browser.runtime.onSuspend.addListener(() => {
      console.log('browser.runtime.onSuspend triggered')
    })
    */
    /**
     *
     *  Function Definitions
     *
     */
    /**
     * Validate if this extension requests background service-worker action
     * @param senderId The ID of the message sender, usually extension ID
     * @returns {boolean} `true` if the message sender is valid, `false` otherwise
     */
    function validateWalletMessageSender(senderId?: string): boolean {
      assert(senderId, 'there is no sender ID to validate, will not proceed')
      assert(
        senderId === browser.runtime.id,
        `sender ID "${senderId}" does not match our extension ID ${browser.runtime.id}`,
      )
      return true
    }
  },
})
