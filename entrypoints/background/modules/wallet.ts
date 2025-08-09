// @ts-expect-error package has no types
import Mnemonic from '@abcpros/bitcore-mnemonic'
import type {
  ScriptChunkPlatformUTF8,
  ScriptChunkSentimentUTF8,
} from 'rank-lib'
import {
  toPlatformBuf,
  toProfileIdBuf,
  toPostIdBuf,
  toSentimentOpCode,
} from 'rank-lib'
import {
  HDPrivateKey,
  Script,
  PrivateKey,
  Transaction,
  Address,
  Message,
} from '@abcpros/bitcore-lib-xpi'
import {
  walletStore,
  WalletState,
  ChainState,
  MutableWalletState,
  UIWalletState,
  WalletBalance,
} from '@/entrypoints/background/stores'
import {
  ChronikClient,
  OutPoint,
  ScriptEndpoint,
  SubscribeMsg,
  WsEndpoint,
  type Utxo as ChronikUtxo,
} from 'chronik-client'
import assert from 'assert'
import { serialize, deserialize, toXPI } from '@/utils/functions'
import {
  RANK_OUTPUT_MIN_VALUE,
  WALLET_CHRONIK_URL,
  WALLET_BIP44_COINTYPE,
  WALLET_BIP44_PURPOSE,
  WALLET_MAX_TX_SIZE,
  WALLET_MAX_TX_INPUTS,
} from '@/utils/constants'

type SendTransactionParams = {
  outAddress: string
  outValue: number
}
type RankTransactionParams = {
  sentiment: ScriptChunkSentimentUTF8
  platform: ScriptChunkPlatformUTF8
  profileId: string
  postId?: string
}
type EventData =
  | string
  | SendTransactionParams
  | RankTransactionParams[]
  | undefined
/** Messaging events between popup and background service worker */
type EventProcessor = (data: EventData) => Promise<void | string | null>
/** A queued `EventProcessor` that is scheduled to be resolved at next `processQueue` call */
type PendingEventProcessor = [EventProcessor, EventData]
/** Runtime queue to store `PendingEventProcessor` until they are called */
type EventQueue = {
  busy: boolean
  pending: PendingEventProcessor[]
}
/** Object describing a UTXO in the wallet's UTXO cache */
export type Utxo = {
  /** Value of the UTXO in satoshis */
  value: string
  /** Height of the UTXO in the blockchain, -1 if in mempool */
  height: number
  /** Whether the UTXO is a coinbase, i.e. from a block reward */
  isCoinbase: boolean
}
// Map key is `${txid}_${outIdx}`, value is BigInt `value` as string
export type UtxoCache = Map<string, Utxo>

type Wallet = {
  seedPhrase: string
  xPrivkey: HDPrivateKey
  signingKey: PrivateKey
  address: Address
  script: Script
  utxos: UtxoCache
  balance: WalletBalance
  tipHeight: number
  tipHash: string
}
/**
 * Static methods used by popup and potentially elsewhere
 */
class WalletTools {
  /**
   *
   * @param text
   * @param privateKey
   * @returns
   */
  static signMessage(text: string, privateKey: string) {
    const message = new Message(text)
    return message.sign(PrivateKey.fromWIF(privateKey))
  }
  /**
   *
   * @param text
   * @param address
   * @param signature
   * @returns
   */
  static verifyMessage(
    text: string,
    address: Address | string,
    signature: string,
  ) {
    const message = new Message(text)
    return message.verify(address, signature)
  }
  /**
   * Returns `true` if Lotus address is valid, `false` otherwise
   * @param address `Address` object or string in XAddress format
   * @returns {boolean}
   */
  static isValidAddress(address: Address | string): boolean {
    return Address.isValid(
      address instanceof Address ? address.toXAddress() : address,
    )
  }
}
/**
 * Utility class for building and deriving wallet components from seed phrases.
 * Handles creation of HD wallets, signing keys, addresses and scripts following BIP44.
 */
class WalletBuilder {
  /**
   * Takes a seed phrase string and builds a complete wallet state object containing:
   * - The original seed phrase
   * - Extended private key (xpriv)
   * - Private key in WIF format for signing
   * - Public address in XAddress format
   * - Payment script in hex and raw data formats
   * - Empty UTXO cache
   * - Zero balance
   *
   * @param seedPhrase - BIP39 mnemonic seed phrase string
   * @returns {WalletState} Complete wallet state object
   */
  static buildWalletState = (seedPhrase: string): WalletState => {
    const mnemonic = new Mnemonic(seedPhrase)
    const hdPrivkey = this.hdPrivkeyFromMnemonic(mnemonic)
    const signingKey = this.deriveSigningKey(hdPrivkey)
    const address = signingKey.toAddress()
    const script = this.scriptFromAddress(address)
    const utxos: UtxoCache = new Map()
    const balance: WalletBalance = {
      total: '0',
      spendable: '0',
    }

    assert(mnemonic, 'unable to get Mnemonic from seedPhrase')
    assert(hdPrivkey, 'unable to generate HDPrivateKey from Mnemonic')
    assert(signingKey, 'unable to derive PrivateKey from HDPrivateKey')
    assert(script, 'unable to parse Script from PrivateKey/Address')

    return {
      seedPhrase: mnemonic.toString(),
      xPrivkey: hdPrivkey.toString(),
      signingKey: signingKey.toWIF(),
      address: address.toXAddress(),
      scriptPayload: script.getData().toString('hex'),
      scriptHex: script.toHex(),
      utxos: serialize(utxos),
      balance,
      tipHeight: 0,
      tipHash: '',
    }
  }
  /** Generates a new random BIP39 mnemonic phrase */
  static newMnemonic = () => new Mnemonic() as Mnemonic
  /** Validates if the `seedPhrase` string is a valid BIP39 mnemonic */
  static isValidSeedPhrase = (seedPhrase: string) =>
    Mnemonic.isValid(seedPhrase)
  /** Creates a `Mnemonic` object from a seed phrase string */
  static mnemonicFromSeedPhrase = (seedPhrase: string) =>
    new Mnemonic(seedPhrase) as Mnemonic
  /** Creates a `Mnemonic` object from a seed buffer */
  static mnemonicFromSeed = (seed: Buffer) =>
    Mnemonic.fromSeed(seed) as Mnemonic
  /** Derives an `HDPrivateKey` from a mnemonic object */
  static hdPrivkeyFromMnemonic = (mnemonic: Mnemonic) =>
    HDPrivateKey.fromSeed(mnemonic.toSeed())
  /** Derives a signing key from an `HDPrivateKey` following BIP44 derivation path */
  static deriveSigningKey = (hdPrivkey: HDPrivateKey, path?: string) =>
    hdPrivkey
      .deriveChild(WALLET_BIP44_PURPOSE, true)
      .deriveChild(WALLET_BIP44_COINTYPE, true)
      .deriveChild(0, true)
      .deriveChild(0)
      .deriveChild(0).privateKey
  /** Creates a `Script` object from an address string or `Address` object */
  static scriptFromAddress = (address: string | Address) =>
    Script.fromAddress(address) ?? null
  /** Creates a `Script` object from a script string */
  static scriptFromString = (script: string) => Script.fromString(script)
}
/**
 * WalletManager handles wallet operations like sending Lotus, submitting RANK votes,
 * and managing UTXOs. It maintains a websocket connection to Chronik for real-time
 * updates and provides access to wallet data like seed phrase, signing keys, and balance.
 */
class WalletManager {
  private chronik!: ChronikClient
  private ws!: WsEndpoint
  private scriptEndpoint!: ScriptEndpoint
  private wallet!: Wallet
  private wsPingInterval!: NodeJS.Timeout
  public queue: EventQueue
  /** */
  constructor() {
    this.queue = {
      busy: false,
      pending: [],
    }
  }
  /** 12-word backup/restore seed phrase */
  get seedPhrase() {
    return this.wallet?.seedPhrase
  }
  /** Private key of wallet spending address in WIF format */
  get signingKey() {
    return this.wallet?.signingKey.toWIF()
  }
  /** 20-byte public key hash to register Chronik `ScriptEndpoint` */
  get scriptPayload() {
    return this.wallet?.script.getData().toString('hex')
  }
  /** Hex-encoded output script for various bitcore-lib-xpi operations */
  get scriptHex() {
    return this.wallet?.script.toHex()
  }
  /** All balances of the wallet in satoshis, calculated from UTXO cache */
  get balance(): WalletBalance {
    let total = 0n
    let spendable = 0n
    for (const [outpoint, utxo] of this.wallet?.utxos?.entries() ?? []) {
      const value = BigInt(utxo.value)
      total += value
      // UTXO is spendable if it is a coinbase and the tip height is 100 blocks or more
      // or it is not a coinbase transaction
      const [txid, outIdx] = outpoint.split('_')
      if (this.isUtxoSpendable({ txid, outIdx: Number(outIdx) })) {
        spendable += value
      }
    }
    return {
      total: total.toString(),
      spendable: spendable.toString(),
    }
  }
  /** Set the total balance of the wallet in satoshis */
  set balance(value: WalletBalance) {
    this.wallet.balance = value
  }
  /** List of outpoints in the wallet's UTXO cache */
  get outpoints() {
    const outpoints: OutPoint[] = []
    this.wallet?.utxos?.forEach((_value, outpoint) => {
      const [txid, outIdx] = outpoint.split('_')
      outpoints.push({ txid, outIdx: Number(outIdx) })
    })
    return outpoints
  }
  /** List of outpoints in the wallet's UTXO cache sorted by value ascending */
  get outpointsSortedByValue(): OutPoint[] {
    return Array.from(this.wallet?.utxos?.entries() ?? [])
      .map(([outpoint, utxo]) => {
        const [txid, outIdx] = outpoint.split('_')
        return {
          outpoint: { txid, outIdx: Number(outIdx) },
          value: BigInt(utxo.value),
        }
      })
      .sort((first, second) =>
        first.value < second.value ? -1 : first.value > second.value ? 1 : 0,
      )
      .map(({ outpoint }) => outpoint)
  }
  /** Blockchain state, updated by `handleWsBlockConnected` */
  get chainState(): ChainState {
    return {
      tipHeight: this.wallet.tipHeight,
      tipHash: this.wallet.tipHash,
    }
  }
  /** Wallet state that gets saved to localStorage when changed */
  get mutableWalletState(): MutableWalletState {
    return {
      utxos: serialize(this.wallet.utxos),
      balance: this.balance,
    }
  }
  /** Wallet state that gets sent to popup UI and potentially used elsewhere */
  get uiWalletState(): UIWalletState {
    return {
      address: this.wallet.address.toXAddress(),
      scriptPayload: this.wallet.script.getData().toString('hex'),
      scriptHex: this.wallet.script.toHex(),
      utxos: serialize(this.wallet.utxos),
      balance: this.balance,
      tipHeight: this.wallet.tipHeight,
      tipHash: this.wallet.tipHash,
    }
  }
  /** Complete wallet state */
  get walletState(): WalletState {
    return {
      seedPhrase: this.wallet.seedPhrase,
      xPrivkey: this.wallet.xPrivkey.toString(),
      signingKey: this.wallet.signingKey.toWIF(),
      address: this.wallet.address.toXAddress(),
      scriptPayload: this.wallet.script.getData().toString('hex'),
      scriptHex: this.wallet.script.toHex(),
      utxos: serialize(this.wallet.utxos),
      balance: this.balance,
      tipHeight: this.wallet.tipHeight,
      tipHash: this.wallet.tipHash,
    }
  }
  /**
   * Initializes the wallet by:
   * 1. Loading saved wallet state from localStorage
   * 2. Reconstructing wallet object from saved state
   * 3. Initializing Chronik API client, script endpoint and WebSocket
   * 4. Resetting UTXO cache and saving updated wallet state
   * 5. Setting up WebSocket subscription for wallet script
   * 6. Starting WebSocket ping interval to keep service worker alive
   * @throws {Error} If no wallet state is found in localStorage
   * @returns {Promise<void>} Promise that resolves when initialization is complete
   */
  async init(): Promise<void> {
    const walletState = await walletStore.loadWalletState()
    if (!walletState) {
      throw new Error(
        'tried to initialize wallet, but no wallet state saved to localStorage',
      )
    }
    // validate balance data from localStorage
    // this is a hack to support old wallet state format
    if (typeof walletState.balance === 'string') {
      walletState.balance = {
        total: '0',
        spendable: '0',
      } as WalletBalance
    }
    // initialize the wallet from the existing state
    this.wallet = {
      seedPhrase: walletState.seedPhrase,
      xPrivkey: HDPrivateKey.fromString(walletState.xPrivkey),
      signingKey: PrivateKey.fromWIF(walletState.signingKey),
      address: Address.fromString(walletState.address),
      script: Script.fromString(walletState.scriptHex),
      utxos: deserialize(walletState.utxos) as UtxoCache,
      balance: walletState.balance,
      tipHeight: walletState.tipHeight,
      tipHash: walletState.tipHash,
    }
    // initialize Chronik API, scriptEndpoint, and WebSocket
    this.chronik = new ChronikClient(WALLET_CHRONIK_URL)
    this.scriptEndpoint = this.chronik.script('p2pkh', this.scriptPayload)
    this.ws = this.chronik.ws({
      autoReconnect: false,
      onConnect: () =>
        console.log(`chronik websocket connected`, this.ws.ws?.url),
      onMessage: this.handleWsMessage,
      onError: async e => {
        console.error('chronik websocket error', e)
        //await this.resetUtxoCache()
      },
      onEnd: async e => {
        console.error('chronik websocket ended abruptly', e)
        //await this.resetUtxoCache()
      },
      onReconnect: async e => {
        console.warn('chronik websocket reconnected', e)
        await this.resetUtxoCache()
      },
    })
    // fetch latest chain state from Chronik API if existing values are default
    if (!this.wallet.tipHeight && !this.wallet.tipHash) {
      await this.updateChainState()
    }
    // reconcile wallet state by removing spent UTXOs and adding new UTXOs
    await this.resetUtxoCache()
    // Save mutable wallet state
    await walletStore.saveMutableWalletState(this.mutableWalletState)
    // await WebSocket online state and set up subscription for wallet script
    await this.ws.waitForOpen()
    this.wsSubscribeP2PKH(this.scriptPayload)
    // Set up WebSocket ping interval to keep background service-worker alive
    this.wsPingInterval = setInterval(async () => {
      const connected = await this.ws.connected
      // check to make sure Chronik WebSocket is connected
      if (
        connected?.target &&
        (connected.target.readyState === WebSocket.CLOSED ||
          connected.target.readyState === WebSocket.CLOSING)
      ) {
        this.ws.close()
        await this.ws.waitForOpen()
        console.warn(
          `chronik websocket reconnected after state "${connected.target.readyState}"`,
        )
      }
      if (!this.queue.busy && this.queue.pending.length < 1) {
        this.queue.pending.push([this.reconcileWalletState, undefined])
        return this.processEventQueue()
      }
      /* // always reconcile wallet state after websocket ping interval
      this.queue.pending.push([this.reconcileWalletState, undefined])
      if (!this.queue.busy) {
        return this.processEventQueue()
      } */
    }, 5000)
  }
  /** Shutdown all active sockets and listeners */
  deinit = async () => {
    clearInterval(this.wsPingInterval)
    this.wsUnsubscribeP2PKH(this.scriptPayload)
    this.ws.close()
  }
  /** Update the wallet's chain state from the Chronik API */
  private updateChainState = async () => {
    const blockchainInfo = await this.chronik.blockchainInfo()
    this.wallet.tipHeight = blockchainInfo.tipHeight
    this.wallet.tipHash = blockchainInfo.tipHash
    return await walletStore.saveChainState(this.chainState)
  }
  /**
   * Handle incoming websocket messages from Chronik
   * @param msg WebSocket message from Chronik
   * @returns {void} Nothing
   */
  private handleWsMessage = async (msg: SubscribeMsg): Promise<void> => {
    switch (msg.type) {
      case 'AddedToMempool':
        this.queue.pending.push([this.handleWsAddedToMempool, msg.txid])
        break
      case 'RemovedFromMempool':
        this.queue.pending.push([this.handleWsRemovedFromMempool, msg.txid])
        break
      case 'Confirmed':
      case 'Reorg':
        this.queue.pending.push([this.handleWsConfirmedOrReorg, msg.txid])
        break
      case 'BlockConnected':
        this.queue.pending.push([this.handleWsBlockConnected, msg.blockHash])
        break
      default:
        // always return when no handler to push to queue
        return
    }
    // Try to resolve the queued `EventProcessor`s if not already busy doing so
    if (!this.queue.busy) {
      return await this.processEventQueue()
    }
  }
  /**
   * Processes the next event in the queue, executing its associated handler function.
   * If there are more events in the queue after processing, recursively processes the next event.
   * After all events are processed, saves the wallet state and marks the queue as no longer busy.
   * @returns {Promise<void>} Promise that resolves when event processing is complete
   */
  private processEventQueue = async (): Promise<void> => {
    this.queue.busy = true
    try {
      const eventProcessor = this.queue.pending.shift()
      assert(
        eventProcessor,
        `trying to execute a queued EventProcessor that doesn't exist`,
      )
      const [EventProcessor, EventData] = eventProcessor
      await EventProcessor(EventData)
    } catch (e) {
      console.error(e)
    }
    // recursively process the next event in the queue
    if (this.queue.pending.length > 0) {
      return await this.processEventQueue()
    }
    // queue is no longer busy
    this.queue.busy = false
  }
  /**
   *
   * @param event
   * @param data
   */
  /*
  pushMessageEventToQueue = async (
    event: keyof WalletMessaging,
    data: EventData,
  ) => {
    switch (event) {
      case 'content-script:submitRankVote': {
        this.queue.pending.push([this.handlePopupSubmitRankVote, data])
        break
      }
      case 'popup:sendLotus': {
        this.queue.pending.push([this.handlePopupSendLotus, data])
        break
      }
    }
    // Try to resolve the queued `EventProcessor`s if not already busy doing so
    if (!this.queue.busy) {
      return this.processEventQueue()
    }
  }
  */
  /**
   * Handles submitting a RANK vote transaction from the popup UI
   * @param data The RANK transaction parameters containing platform, profileId, sentiment, and optional postId/comment
   * @returns {Promise<string|null>} The transaction ID if successful, undefined otherwise
   */
  handlePopupSubmitRankVote: EventProcessor = async (
    data: EventData,
  ): Promise<string> => {
    // craft and send RANK tx
    const [tx, spentInputs] = this.craftRankTx(data as RankTransactionParams[])
    // send tx
    const txid = await this.broadcastTx(tx.toBuffer())
    // remove the spent inputs from the wallet's UTXO cache
    this.reconcileSpentUtxos(spentInputs)
    // return the txid
    return txid
  }
  /**
   * Handles sending Lotus tokens from the popup UI
   * @param data The send transaction parameters containing output address and value
   * @returns {Promise<string|null>} The transaction ID if successful, undefined otherwise
   */
  handlePopupSendLotus: EventProcessor = async (
    data: EventData,
  ): Promise<string> => {
    const { outAddress, outValue } = data as SendTransactionParams
    // craft and send the give tx
    const [tx, spentInputs] = this.craftSendTx(outAddress, outValue)
    console.log('crafted spend tx', tx.toJSON())
    // send tx
    const txid = await this.broadcastTx(tx.toBuffer())
    // remove the spent inputs from the wallet's UTXO cache
    this.reconcileSpentUtxos(spentInputs)
    // return the txid
    return txid
  }
  /**
   * Handles when a transaction is added to the mempool that pays to this wallet's address
   * @param data String containing the transaction ID (txid) of the mempool transaction
   * @returns void after updating the wallet's balance and UTXO cache if applicable
   */
  private handleWsAddedToMempool: EventProcessor = async (data: EventData) => {
    const txid = data as string
    const tx = await this.chronik.tx(txid)
    for (let i = 0; i < tx.outputs.length; i++) {
      const outpoint = `${txid}_${i}`
      if (!this.wallet.utxos.has(outpoint)) {
        const output = tx.outputs[i]
        if (this.scriptHex == output.outputScript) {
          console.log(
            `AddedToMempool: received ${toXPI(output.value)} Lotus, saving utxo to cache`,
          )
          // calculate total balance with new output
          const balance = BigInt(this.balance.total)
          const value = BigInt(output.value)
          // add new data to wallet state
          this.balance.total = (balance + value).toString()
          // height is -1 for mempool utxos
          this.wallet.utxos.set(outpoint, {
            value: output.value,
            height: -1,
            isCoinbase: tx.isCoinbase,
          })
          // save mutable wallet state to localStorage and return
          return await walletStore.saveMutableWalletState(
            this.mutableWalletState,
          )
        }
      }
    }
  }
  /**
   * Handles when a transaction is removed from the mempool
   * @param data String containing the transaction ID (txid) of the removed transaction
   * @returns void after updating the wallet's UTXO cache if applicable
   */
  private handleWsRemovedFromMempool: EventProcessor = async (
    data: EventData,
  ) => {
    const txid = data as string
    const tx = await this.chronik.tx(txid)
    for (let i = 0; i < tx.outputs.length; i++) {
      const outpoint = `${txid}_${i}`
      const utxo = this.wallet.utxos.get(outpoint)
      if (utxo) {
        console.log(`RemovedFromMempool: removing utxo ${outpoint}`)
        this.wallet.utxos.delete(outpoint)
        // save mutable wallet state to localStorage and return
        return await walletStore.saveMutableWalletState(this.mutableWalletState)
      }
    }
  }
  /**
   * Handles when a transaction is confirmed in the blockchain
   * @param data String containing the transaction ID (txid) of the confirmed transaction
   * @returns void after updating the wallet's UTXO cache if applicable
   */
  private handleWsConfirmedOrReorg: EventProcessor = async (
    data: EventData,
  ) => {
    const txid = data as string
    const tx = await this.chronik.tx(txid)
    for (let i = 0; i < tx.outputs.length; i++) {
      const outpoint = `${txid}_${i}`
      const utxo = this.wallet.utxos.get(outpoint)
      if (utxo) {
        console.log(`Confirmed: updating utxo ${outpoint}`)
        this.wallet.utxos.set(outpoint, {
          // keep the same value
          value: utxo.value,
          // update the height
          height: tx.block?.height ?? -1,
          isCoinbase: tx.isCoinbase,
        })
        // save mutable wallet state to localStorage and return
        // we don't need to process any more outputs from the tx
        return await walletStore.saveMutableWalletState(this.mutableWalletState)
      }
    }
  }
  /**
   * Handles when a block is connected to the blockchain
   * @param data String containing the block hash
   * @returns void after updating the wallet's tip height and hash
   */
  private handleWsBlockConnected: EventProcessor = async (data: EventData) => {
    const blockHash = data as string
    const block = await this.chronik.block(blockHash)
    console.log(
      `BlockConnected: updating tip height to ${block.blockInfo.height} with tipHash ${blockHash}`,
    )
    this.wallet.tipHeight = block.blockInfo.height
    this.wallet.tipHash = blockHash
    // save blockchain state to localStorage and return
    return await walletStore.saveChainState(this.chainState)
  }
  /**
   * Reconciles the wallet's state by removing spent UTXOs and updating the balance
   * @param spentInputs The list of spent UTXOs to reconcile
   * @returns void after updating the wallet's balance and UTXO cache
   */
  private reconcileSpentUtxos = (spentInputs: OutPoint[]) => {
    let total = BigInt(this.balance.total)
    let spendable = BigInt(this.balance.spendable)
    for (const { txid, outIdx } of spentInputs) {
      const outpoint = `${txid}_${outIdx}`
      const utxo = this.wallet.utxos.get(outpoint)
      if (utxo) {
        total -= BigInt(utxo.value)
        spendable -= BigInt(utxo.value)
        this.wallet.utxos.delete(outpoint)
      }
    }
    this.balance = {
      total: total.toString(),
      spendable: spendable.toString(),
    }
  }
  /**
   * Reconciles the wallet's state by validating and updating the UTXO cache and balance.
   * This method:
   * 1. Starts with current wallet balance
   * 2. Removes any invalid/spent UTXOs from cache and subtracts their values from balance
   * 3. Adds any new UTXOs found in the complete UTXO set and adds their values to balance
   * 4. Updates the wallet's final balance
   * @returns Promise that resolves when reconciliation is complete
   */
  private reconcileWalletState = async () => {
    // current balance
    let total = BigInt(this.balance.total)
    let spendable = BigInt(this.balance.spendable)
    // Validate UTXO set against Chronik API, remove invalid UTXOs from cache
    for await (const { txid, outIdx } of this.validateUtxos()) {
      const outpoint = `${txid}_${outIdx}`
      const utxo = this.wallet.utxos.get(outpoint)
      if (utxo) {
        console.log(`removing spent utxo ${outpoint} from cache`)
        total -= BigInt(utxo.value)
        spendable -= BigInt(utxo.value)
        this.wallet.utxos.delete(outpoint)
      }
    }
    // Fetch missing UTXOs from Chronik API, add to cache
    for await (const utxo of this.fetchScriptUtxoSet()) {
      const { txid, outIdx } = utxo.outpoint
      const outpoint = `${txid}_${outIdx}`
      if (!this.wallet.utxos.has(outpoint)) {
        console.log(`adding new utxo ${outpoint} to cache`)
        total += BigInt(utxo.value)
        this.wallet.utxos.set(outpoint, {
          value: utxo.value,
          height: utxo.blockHeight,
          isCoinbase: utxo.isCoinbase,
        })
        if (this.isUtxoSpendable(utxo.outpoint)) {
          spendable += BigInt(utxo.value)
        }
      }
    }
    // update the wallet balance
    this.balance.total = total.toString()
    this.balance.spendable = spendable.toString()
    // save mutable wallet state to localStorage
    await walletStore.saveMutableWalletState(this.mutableWalletState)
  }
  /**
   * Resets the UTXO cache to the complete UTXO set from the Chronik API.
   * This method:
   * 1. Queries the Chronik scriptEndpoint for all UTXOs associated with the wallet's script
   * 2. Updates the wallet's UTXO cache with the fetched UTXOs
   * 3. Recalculates and updates the wallet's total balance
   * @returns {Promise<void>}
   */
  private resetUtxoCache = async (): Promise<void> => {
    // clear wallet balance and UTXO cache
    console.log('resetting UTXO cache')
    let total = 0n
    let spendable = 0n
    this.wallet.utxos.clear()
    // fetch and store the complete UTXO set
    for await (const utxo of this.fetchScriptUtxoSet()) {
      const { txid, outIdx } = utxo.outpoint
      const outpoint = `${txid}_${outIdx}`
      console.log(`adding utxo ${outpoint} to cache`)
      total += BigInt(utxo.value)
      this.wallet.utxos.set(outpoint, {
        value: utxo.value,
        height: utxo.blockHeight,
        isCoinbase: utxo.isCoinbase,
      })
      if (this.isUtxoSpendable(utxo.outpoint)) {
        spendable += BigInt(utxo.value)
      }
    }
    // update the wallet's balance
    this.balance = {
      total: total.toString(),
      spendable: spendable.toString(),
    }
    console.log('UTXO cache reset complete')
  }
  /**
   * Generator function that validates the wallet's UTXOs against the Chronik API.
   * Yields any invalid outpoints that should be removed from the wallet's UTXO set.
   * An outpoint is considered invalid if:
   * - The transaction doesn't exist
   * - The output index doesn't exist
   * - The output has been spent
   * @returns {AsyncIterable<OutPoint>} Generator yielding invalid outpoints
   */
  private async *validateUtxos(): AsyncIterable<OutPoint> {
    const results = await this.chronik.validateUtxos(this.outpoints)
    for (let i = 0; i < results.length; i++) {
      const outpoint = this.outpoints[i]
      if (!outpoint) {
        continue
      }
      const { txid, outIdx } = outpoint
      const { state } = results[i]
      switch (state) {
        case 'NO_SUCH_OUTPUT':
        case 'NO_SUCH_TX':
        case 'SPENT':
          // remove invalid utxo from cache
          yield { txid, outIdx }
      }
    }
  }
  /**
   * Fetches the complete UTXO set for the wallet's script from the Chronik API.
   *
   * This generator function:
   * 1. Queries the Chronik scriptEndpoint for all UTXOs associated with the wallet's script
   * 2. Updates the wallet's UTXO cache with the fetched UTXOs
   * 3. Recalculates and updates the wallet's total balance
   *
   * If no UTXOs are found, the generator returns without making any changes.
   * Any errors during the API call are logged but not thrown, as UTXO fetching
   * is considered non-critical for wallet operation.
   *
   * @returns {AsyncIterable<Utxo>} Generator that updates wallet state but yields nothing
   */
  private async *fetchScriptUtxoSet(): AsyncIterable<ChronikUtxo> {
    try {
      const result = await this.scriptEndpoint.utxos()
      if (!result.length) {
        return
      }
      const [{ utxos }] = result
      for (const utxo of utxos) {
        yield utxo
      }
    } catch (e) {
      console.error('fetchScriptUtxoSet', e)
      // no need for special error handling here
      // we have bigger problems if we get here
    }
  }
  /**
   * Broadcasts a transaction to the Chronik API
   * @param tx The transaction to broadcast
   * @returns The transaction ID if successful, null otherwise
   */
  private broadcastTx = async (txBuf: Buffer): Promise<string> => {
    const result = await this.chronik.broadcastTx(txBuf)
    return result.txid
  }
  /**
   * Subscribes to the Chronik API with the given `scriptPayload`
   * @param scriptPayload The script payload to subscribe to
   * @returns {void}
   */
  private wsSubscribeP2PKH = (scriptPayload: string): void =>
    this.ws.subscribe('p2pkh', scriptPayload)
  /**
   * Unsubscribes from the Chronik API with the given `scriptPayload`
   * @param scriptPayload The script payload to unsubscribe from
   * @returns {void}
   */
  private wsUnsubscribeP2PKH = (scriptPayload: string): void =>
    this.ws.unsubscribe('p2pkh', scriptPayload)
  /**
   * Crafts a RANK output with the given parameters
   * @param satoshis The value for the output, in satoshis
   * @param sentiment The sentiment for the output
   * @param platform The platform for the output
   * @param profileId The profile ID for the output
   * @param postId The post ID for the output
   * @param comment The comment for the output
   * @returns {Transaction.Output} The crafted RANK output
   */
  private craftRankOutput = ({
    satoshis,
    sentiment,
    platform,
    profileId,
    postId,
    comment,
  }: {
    satoshis: number
    sentiment: ScriptChunkSentimentUTF8
    platform: ScriptChunkPlatformUTF8
    profileId: string
    postId?: string
    comment?: string
  }): Transaction.Output => {
    const script = new Script('')
    script.add('OP_RETURN')
    script.add(Buffer.from('RANK'))
    // Add sentiment opcode
    script.add(toSentimentOpCode(sentiment))
    // Add platform byte
    script.add(toPlatformBuf(platform))
    // Add LOWERCASE profileId bytes
    script.add(toProfileIdBuf(platform, profileId.toLowerCase()))
    // Add postId bytes if applicable
    if (postId) {
      script.add(toPostIdBuf(platform, postId))
    }
    // TODO: some additional script stuff here

    return new Transaction.Output({ satoshis, script })
  }
  /**
   * Crafts a RANK transaction with the given parameters
   * @param param0 The parameters for the RANK transaction
   * @returns {Transaction} The crafted RANK transaction
   */
  private craftRankTx = (
    ranks: RankTransactionParams[],
  ): [Transaction, OutPoint[]] => {
    const tx = new Transaction()
    // set some default tx params
    tx.feePerByte(2)
    tx.change(this.wallet.address)
    // Add the paid RANK output to the tx
    const paidRankOutput = ranks.shift()!
    tx.addOutput(
      this.craftRankOutput({
        satoshis: RANK_OUTPUT_MIN_VALUE,
        ...paidRankOutput,
      }),
    )
    // Add neutral RANK outputs to the tx
    for (const rank of ranks) {
      tx.addOutput(
        this.craftRankOutput({
          satoshis: 0,
          ...rank,
        }),
      )
    }
    /*
    if (comment) {
      // TODO: add comment bytes to 2nd OP_RETURN output
    }
    */
    const txFee = tx._estimateSize() * 2
    // track the inputs used in the tx
    const spentInputs: OutPoint[] = []
    // gather utxos until we have more than outValue
    for (const { txid, outIdx } of this.outpoints) {
      // skip non-spendable UTXOs
      if (!this.isUtxoSpendable({ txid, outIdx })) {
        continue
      }
      const utxo = this.wallet.utxos.get(`${txid}_${outIdx}`)!
      tx.addInput(
        new Transaction.Input.PublicKeyHash({
          prevTxId: txid,
          outputIndex: outIdx,
          output: new Transaction.Output({
            satoshis: utxo.value,
            script: this.scriptHex,
          }),
          script: this.wallet.script,
        }),
      )
      spentInputs.push({ txid, outIdx })
      // don't use anymore inputs if we have enough value already
      if (tx.inputAmount > RANK_OUTPUT_MIN_VALUE + txFee) {
        break
      }
    }

    // Finalize tx
    tx.sign(this.wallet.signingKey)
    const verified = tx.verify()
    switch (typeof verified) {
      case 'boolean':
        return [tx, spentInputs]
      case 'string':
        throw new Error(
          `craftRankTx produced an invalid transaction: ${verified}\r\n${tx.toJSON().toString()}`,
        )
    }
  }
  /**
   * Crafts a send transaction with the given parameters
   * @param outAddress The address to send the transaction to
   * @param outValue The value to send in the transaction
   * @returns {Transaction} The crafted send transaction
   */
  private craftSendTx = (
    outAddress: string,
    outValue: number,
  ): [Transaction, OutPoint[]] => {
    const tx = new Transaction()
    // set some default tx params
    tx.feePerByte(2)
    tx.change(this.wallet.address)
    // track the inputs used in the tx
    const spentInputs: OutPoint[] = []
    // gather utxos until we have more than outValue
    for (const { txid, outIdx } of this.outpoints) {
      // skip non-spendable UTXOs
      if (!this.isUtxoSpendable({ txid, outIdx })) {
        continue
      }
      const utxo = this.wallet.utxos.get(`${txid}_${outIdx}`)!
      tx.addInput(
        new Transaction.Input.PublicKeyHash({
          prevTxId: txid,
          outputIndex: outIdx,
          output: new Transaction.Output({
            satoshis: utxo.value,
            script: this.scriptHex,
          }),
          script: this.wallet.script,
        }),
      )
      spentInputs.push({ txid, outIdx })
      // don't use anymore inputs if we have enough value already
      if (tx.inputAmount > outValue) {
        break
      }
    }
    // remove inputs if the tx size is too large
    while (tx._estimateSize() > WALLET_MAX_TX_SIZE) {
      console.log(
        `tx size ${tx._estimateSize()} bytes is too large, removing last input`,
      )
      const lastInput = tx.inputs.pop()
      if (lastInput) {
        spentInputs.pop()
      }
    }
    // tx fee 2sat/byte default
    const txFee = tx._estimateSize() * 2
    tx.addOutput(
      new Transaction.Output({
        satoshis: txFee > tx.inputAmount ? outValue - txFee : outValue,
        script: WalletBuilder.scriptFromAddress(outAddress),
      }),
    )
    tx.sign(this.wallet.signingKey)
    const verified = tx.verify()
    switch (typeof verified) {
      case 'boolean':
        return [tx, spentInputs]
      case 'string':
        throw new Error(
          `craftSendTx produced an invalid transaction: ${verified}\r\n${tx.toJSON().toString()}`,
        )
    }
  }
  /**
   * Checks if a UTXO is spendable
   * @param utxo The UTXO to check
   * @returns True if the UTXO is spendable, false otherwise
   */
  private isUtxoSpendable = ({ txid, outIdx }: OutPoint): boolean => {
    const utxo = this.wallet.utxos.get(`${txid}_${outIdx}`)!
    if (utxo.isCoinbase) {
      return this.chainState.tipHeight - utxo.height >= 100
    }
    return true
  }
  /**
   * Consolidates the wallet's UTXO cache by spending all low-value UTXOs
   * and reducing the total wallet UTXO set.
   * @returns {Promise<{ txids: string[], spentInputs: OutPoint[] }>} The txids of consolidation transactions and spent inputs
   */
  private consolidateUtxos = async (): Promise<{
    txids: string[]
    spentInputs: OutPoint[]
  }> => {
    // Define a threshold for "low-value" UTXOs (e.g., 0.01 XPI = 1,000,000 sats)
    const CONSOLIDATION_THRESHOLD = RANK_OUTPUT_MIN_VALUE // 100 XPI in satoshis

    // Gather all spendable low-value UTXOs
    const lowValueUtxos: { outpoint: OutPoint; utxo: Utxo }[] = []
    for (const { txid, outIdx } of this.outpoints) {
      const utxo = this.wallet.utxos.get(`${txid}_${outIdx}`)!
      if (
        this.isUtxoSpendable({ txid, outIdx }) &&
        BigInt(utxo.value) <= BigInt(CONSOLIDATION_THRESHOLD)
      ) {
        lowValueUtxos.push({ outpoint: { txid, outIdx }, utxo })
      }
    }

    if (lowValueUtxos.length === 0) {
      return { txids: [], spentInputs: [] }
    }

    // For simplicity, consolidate all low-value UTXOs into a single transaction if possible
    // If too many inputs, split into multiple transactions
    const txids: string[] = []
    const spentInputs: OutPoint[] = []

    // We'll send the consolidated output back to our own address
    const outAddress = this.wallet.address.toString()

    for (let i = 0; i < lowValueUtxos.length; i += WALLET_MAX_TX_INPUTS) {
      const chunk = lowValueUtxos.slice(i, i + WALLET_MAX_TX_INPUTS)
      const inputs: OutPoint[] = []
      const totalValue = chunk.reduce(
        (sum, { utxo }) => sum + BigInt(utxo.value),
        0n,
      )

      // Estimate fee: 2 sat/byte, rough size estimate
      // We'll use bitcore-lib-xpi's Transaction to estimate
      const tx = new Transaction()
      for (const {
        outpoint: { txid, outIdx },
        utxo,
      } of chunk) {
        tx.addInput(
          new Transaction.Input.PublicKeyHash({
            prevTxId: txid,
            outputIndex: outIdx,
            output: new Transaction.Output({
              satoshis: utxo.value,
              script: this.scriptHex,
            }),
            script: this.wallet.script,
          }),
        )
        inputs.push({ txid, outIdx })
      }
      // Add a dummy output to estimate size
      tx.to(outAddress, Number(totalValue))
      const estimatedSize = tx._estimateSize()
      const fee = BigInt(estimatedSize * 2)
      // Remove dummy output and add real output with fee subtracted
      tx.outputs = []
      const outputValue = totalValue > fee ? totalValue - fee : 0n
      if (outputValue <= 0n) {
        // Not enough to cover fee, skip this chunk
        continue
      }
      tx.to(outAddress, Number(outputValue))
      tx.sign(this.wallet.signingKey)
      const verified = tx.verify()
      if (verified !== true) {
        // If not valid, skip this chunk
        console.error(
          `consolidateUtxos: invalid transaction: ${verified}\r\n${tx.toJSON().toString()}`,
        )
        continue
      }
      // Broadcast the transaction
      const txid = await this.broadcastTx(tx.toBuffer())
      txids.push(txid)
      spentInputs.push(...inputs)
    }

    return { txids, spentInputs }
  }
}

export { WalletManager, WalletBuilder, WalletTools }
