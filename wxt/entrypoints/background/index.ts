import { Wallet, WalletBuilder } from '@/modules/wallet'
import { LoadedWalletState, walletStore } from '@/entrypoints/background/stores'
import { walletMessaging } from '@/entrypoints/background/messaging'

export default defineBackground({
  type: 'module',
  main: () => {
    walletMessaging.onMessage('seedPhrase', async ({ sender, data: seedPhrase }) => {
      console.log(`sender.id`, sender.id)
      // Process new mnemonic phrase for privkey/script
      try {
        // Build a new wallet state from the generated seed phrase
        const walletState = WalletBuilder.buildWalletState(seedPhrase)
        // Save the new wallet into local storage
        await walletStore.saveWalletState(walletState)
        // Send this data to popup
        await walletMessaging.sendMessage('walletState', walletState as LoadedWalletState)
      } catch (e) {
        console.error(e)
      }
    })
    walletMessaging.onMessage('loadWalletState', async ({ sender }) => {
      console.log(`sender.id`, sender.id)
      try {
        const walletState = await walletStore.loadWalletState()
        if (walletState) {
          await walletMessaging.sendMessage('walletState', walletState)
        }
      } catch (e) {
        console.error(e)
      }
    })
    console.log('Hello background!', { id: browser.runtime.id })
  },
})
