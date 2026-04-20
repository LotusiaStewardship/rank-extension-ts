import {
  WalletManager,
  WalletBuilder,
} from '@/entrypoints/background/modules/wallet'
import {
  walletStore,
  instanceStore,
  minerStore,
  type ExtensionInstance,
  type MinerStatus,
} from '@/entrypoints/background/stores'
import {
  instanceMessaging,
  walletMessaging,
  minerMessaging,
} from '@/entrypoints/background/messaging'
import { LotusMiningService } from '@/entrypoints/background/miner'
import assert from 'assert'

export default defineBackground({
  persistent: true,
  type: 'module',
  main: () => {
    /** Instantiated `WalletManager` used during background service-worker runtime */
    const walletManager = new WalletManager()
    /** Instantiated mining runtime; recreated on config changes */
    let miningService: LotusMiningService | null = null
    /**
     *
     *  Register Event Handlers
     *
     */
    /**
     * Register the extension instance with the Lotusia Stewardship
     */
    instanceMessaging.onMessage(
      'popup:registerInstance',
      async ({ sender, data }) => {
        validateMessageSender(sender.id)
        const { optin, signature } = data
        // this user is cringe
        if (!optin) {
          return void (await instanceStore.setRegisterStatus(false))
        }
        // this user is based
        await instanceStore.setRegisterStatus(true)
        const instance = await instanceStore.getInstance()
        try {
          const result = await registerInstance(instance!, signature)
          console.log(result)
          if (result.success) {
            console.log('received onboarding fund from The Lotusia Stewardship')
          }
        } catch (e) {
          console.warn(e)
        }
      },
    )
    minerMessaging.onMessage('popup:minerLoadConfig', async ({ sender }) => {
      validateMessageSender(sender.id)
      const config = await minerStore.getConfig()
      if (!config.mineToAddress) {
        const walletState = walletManager.uiWalletState
        if (walletState?.address) {
          return await minerStore.patchConfig({
            mineToAddress: walletState.address,
          })
        }
        const persistedWallet = await walletStore.loadWalletState()
        if (persistedWallet?.address) {
          return await minerStore.patchConfig({
            mineToAddress: persistedWallet.address,
          })
        }
      }
      return config
    })

    minerMessaging.onMessage('popup:minerSaveConfig', async ({ sender, data }) => {
      validateMessageSender(sender.id)
      await minerStore.setConfig(data)
      await stopMinerRuntime()
      return await minerStore.getConfig()
    })

    minerMessaging.onMessage('popup:minerLoadStatus', async ({ sender }) => {
      validateMessageSender(sender.id)
      const status = await buildMinerStatus()
      await minerStore.setStatus(status)
      return status
    })

    minerMessaging.onMessage('popup:minerStart', async ({ sender }) => {
      validateMessageSender(sender.id)
      const config = await minerStore.getConfig()
      if (!config.mineToAddress) {
        const next = await minerStore.patchStatus({
          running: false,
          lastError: 'mineToAddress is required',
          webgpuSupported: 'gpu' in navigator,
        })
        return next
      }
      await stopMinerRuntime()
      miningService = new LotusMiningService({
        mineToAddress: config.mineToAddress,
        rpc: {
          rpcUrl: config.rpcUrl,
          rpcUser: config.rpcUser,
          rpcPassword: config.rpcPassword,
        },
        gpuPreferences: config.gpuPreferences,
        rpcPollIntervalMs: config.rpcPollIntervalMs,
        iterations: config.iterations,
        kernelSize: config.kernelSize,
        hashrateWindowMs: config.hashrateWindowMs,
      })
      try {
        await miningService.start()
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        await minerStore.patchStatus({
          running: false,
          lastError: message,
          webgpuSupported: 'gpu' in navigator,
        })
      }
      return await buildMinerStatus()
    })

    minerMessaging.onMessage('popup:minerStop', async ({ sender }) => {
      validateMessageSender(sender.id)
      await stopMinerRuntime()
      return await buildMinerStatus()
    })

    setInterval(async () => {
      const status = await buildMinerStatus()
      await minerStore.setStatus(status)
    }, 1000)

    /**
     * Load the signing key from the wallet manager
     */
    walletMessaging.onMessage('popup:loadSigningKey', ({ sender }) => {
      validateMessageSender(sender.id)
      return walletManager.signingKey
    })
    /**
     * Initialize the seed phrase for the wallet manager
     */
    walletMessaging.onMessage(
      'popup:initializeWallet',
      async ({ sender, data: seedPhrase }) => {
        validateMessageSender(sender.id)
        // if WalletManager is already initialized, deinitialize it
        if (walletManager.seedPhrase) {
          await walletManager.deinit()
        }
        // Build a new wallet state from the generated seed phrase
        const walletState = WalletBuilder.buildWalletState(seedPhrase)
        // Save the new wallet into local storage
        await walletStore.saveWalletState(walletState)
        await walletManager.init()
        // Generate extension instanceId
        const instanceId = await instanceStore.getInstanceId()
        if (!instanceId) {
          const instance = await newInstance(browser.runtime.id)
          await instanceStore.saveExtensionInstance(instance)
        }
        // set/reset some store values
        //await instanceStore.setRegisterStatus(false)
        await instanceStore.setAuthorizationHeader('')
        // Return the new wallet details to the popup UI
        return walletManager.uiWalletState
      },
    )
    /**
     * Load the wallet state from the wallet manager
     */
    walletMessaging.onMessage('popup:loadWalletState', ({ sender }) => {
      try {
        validateMessageSender(sender.id)
        return walletManager.uiWalletState
      } catch (e) {
        console.error(e)
      }
    })
    /**
     * Check if the wallet needs to be consolidated
     */
    walletMessaging.onMessage('popup:needsUtxoConsolidation', ({ sender }) => {
      try {
        validateMessageSender(sender.id)
        return walletManager.needsUtxoConsolidation
      } catch (e) {
        console.error('error during "popup:needsUtxoConsolidation"', e)
        return false
      }
    })
    /**
     * Consolidate the wallet's UTXO set
     */
    walletMessaging.onMessage('popup:defragWallet', async ({ sender }) => {
      try {
        validateMessageSender(sender.id)
        return (await walletManager.handlePopupDefragWallet(
          undefined,
        )) as string[]
      } catch (e) {
        console.error('error during "popup:consolidateWallet"', e)
        return []
      }
    })
    /**
     * Send Lotus to an address
     */
    walletMessaging.onMessage('popup:sendLotus', async ({ sender, data }) => {
      try {
        validateMessageSender(sender.id)
        const txid = (await walletManager.handlePopupSendLotus(data)) as string
        console.log(
          `successfully sent ${data.outValue} sats to ${data.outAddress}`,
          txid,
        )
        return txid
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (e: any) {
        console.error('error during "popup:sendLotus"', e)
        return e.message
      }
    })
    /**
     * Submit a RANK vote
     */
    walletMessaging.onMessage(
      'content-script:submitRankVote',
      async ({ sender, data }) => {
        // get the first RANK output to log the vote
        // first output is the paid RANK output
        const { platform, profileId, sentiment, postId } = data.ranks[0]
        try {
          validateMessageSender(sender.id)
          const txid = (await walletManager.handlePopupSubmitRankVote(
            data,
          )) as string
          console.log(
            `successfully cast ${sentiment} vote for ${platform}/${profileId}/${postId}`,
            txid,
          )
          return txid
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (e: any) {
          console.error('error during "content-script:submitRankVote"', e)
          return e.message
        }
      },
    )
    /**
     * Get the 20-byte P2PKH (scriptPayload) from the wallet manager
     */
    walletMessaging.onMessage(
      'content-script:getScriptPayload',
      async ({ sender, data }) => {
        try {
          validateMessageSender(sender.id)
          return walletManager.scriptPayload
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (e: any) {
          throw new Error(
            `error during 'content-script:getScriptPayload': ${e.message}`,
          )
        }
      },
    )
    /**
     * Load the seed phrase from the wallet manager
     */
    walletMessaging.onMessage('popup:loadSeedPhrase', async ({ sender }) => {
      try {
        validateMessageSender(sender.id)
        return walletManager.seedPhrase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (e: any) {
        throw new Error(`error during 'popup:loadSeedPhrase': ${e.message}`)
      }
    })
    // Load wallet state, or open popup ui to generate seed for new wallet state
    walletManager
      .init()
      .then(async () => {
        console.log('initialized wallet manager')
      })
      .catch(async () => {
        browser.action.openPopup()
      })
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
    function validateMessageSender(senderId?: string): void {
      assert(senderId, 'there is no sender ID to validate, will not proceed')
      assert(
        senderId === browser.runtime.id,
        `sender ID "${senderId}" does not match our extension ID ${browser.runtime.id}`,
      )
    }

    async function stopMinerRuntime(): Promise<void> {
      if (!miningService) {
        return
      }
      miningService.stop()
      miningService = null
      await minerStore.patchStatus({
        running: false,
        hashrate: 0,
        testedNonces: '0',
      })
    }

    async function buildMinerStatus(): Promise<MinerStatus> {
      const stats = miningService?.getStats()
      const running = Boolean(miningService?.isRunning)
      const lastError = miningService?.lastError ?? ''
      return {
        running,
        hashrate: stats?.hashrate ?? 0,
        testedNonces: (stats?.testedNonces ?? 0n).toString(),
        webgpuSupported: 'gpu' in navigator,
        lastError,
        updatedAt: Date.now(),
      }
    }

    async function registerInstance(
      instance: ExtensionInstance,
      signature: string,
    ) {
      // sign the instanceId hash with our wallet key
      //const signature = walletManager.signMessage(generated.instanceId)
      // send HTTP POST request with instance info to receive onboarding
      const result = await fetch(
        'https://rank.lotusia.org/api/v1/instance/register',
        {
          method: 'post',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...instance,
            scriptPayload: walletManager.scriptPayload,
            signature,
          }),
        },
      )
      return await result.json()
    }
  },
})
