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
  MutableWalletState,
  UIWalletState,
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
  comment?: string
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
// Map key is `${txid}_${outIdx}`, value is BigInt `value` as string
export type UtxoCache = Map<string, string>

type Wallet = {
  seedPhrase: string
  xPrivkey: HDPrivateKey
  signingKey: PrivateKey
  address: Address
  script: Script
  utxos: UtxoCache
  balance: string
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
      balance: '0',
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
  /** Total balance of the wallet in satoshis */
  get balance() {
    let balance = 0n
    for (const value of this.wallet?.utxos?.values() ?? []) {
      balance += BigInt(value)
    }
    return balance.toString()
  }
  /** Set the balance of the wallet in satoshis */
  set balance(value: string) {
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
    // initialize the wallet from the existing state
    this.wallet = {
      seedPhrase: walletState.seedPhrase,
      xPrivkey: HDPrivateKey.fromString(walletState.xPrivkey),
      signingKey: PrivateKey.fromWIF(walletState.signingKey),
      address: Address.fromString(walletState.address),
      script: Script.fromString(walletState.scriptHex),
      utxos: deserialize(walletState.utxos) as UtxoCache,
      balance: walletState.balance,
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
        // TODO: need to implement this handler
        // this.queue.pending.push([this.handleWsRemovedFromMempool, msg.txid])
        // replace the following `return` with a `break` once handler is ready
        return
      case 'Confirmed':
        // can return here, don't care about blocks
        return
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
    // Save mutable wallet state
    await walletStore.saveMutableWalletState(this.mutableWalletState)
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
          const balance = BigInt(this.balance)
          const value = BigInt(output.value)
          // add new data to wallet state
          this.balance = (balance + value).toString()
          this.wallet.utxos.set(outpoint, output.value)
          return
        }
      }
    }
  }
  /**
   * Reconciles the wallet's state by removing spent UTXOs and updating the balance
   * @param spentInputs The list of spent UTXOs to reconcile
   * @returns void after updating the wallet's balance and UTXO cache
   */
  private reconcileSpentUtxos = (spentInputs: OutPoint[]) => {
    let balance = BigInt(this.balance)
    for (const { txid, outIdx } of spentInputs) {
      const outpoint = `${txid}_${outIdx}`
      const value = this.wallet.utxos.get(outpoint)
      if (value) {
        balance -= BigInt(value)
        this.wallet.utxos.delete(outpoint)
      }
    }
    this.balance = balance.toString()
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
    let balance = BigInt(this.balance)
    // Validate UTXO set against Chronik API, remove invalid UTXOs from cache
    for await (const { txid, outIdx } of this.validateUtxos()) {
      const outpoint = `${txid}_${outIdx}`
      const value = this.wallet.utxos.get(outpoint)
      if (value) {
        console.log(`removing spent utxo ${outpoint} from cache`)
        balance -= BigInt(value)
        this.wallet.utxos.delete(outpoint)
      }
    }
    // Fetch missing UTXOs from Chronik API, add to cache
    for await (const utxo of this.fetchScriptUtxoSet()) {
      const { txid, outIdx } = utxo.outpoint
      const outpoint = `${txid}_${outIdx}`
      if (!this.wallet.utxos.has(outpoint)) {
        console.log(`adding new utxo ${outpoint} to cache`)
        balance += BigInt(utxo.value)
        this.wallet.utxos.set(outpoint, utxo.value)
      }
    }
    // update the wallet balance
    this.balance = balance.toString()
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
    let balance = 0n
    this.wallet.utxos.clear()
    // fetch and store the complete UTXO set
    for await (const utxo of this.fetchScriptUtxoSet()) {
      const { txid, outIdx } = utxo.outpoint
      const outpoint = `${txid}_${outIdx}`
      console.log(`adding utxo ${outpoint} to cache`)
      balance += BigInt(utxo.value)
      this.wallet.utxos.set(outpoint, utxo.value)
    }
    // update the wallet's balance
    this.balance = balance.toString()
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
      const value = this.wallet.utxos.get(`${txid}_${outIdx}`)!
      tx.addInput(
        new Transaction.Input.PublicKeyHash({
          prevTxId: txid,
          outputIndex: outIdx,
          output: new Transaction.Output({
            satoshis: value,
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
      const value = this.wallet.utxos.get(`${txid}_${outIdx}`)!
      tx.addInput(
        new Transaction.Input.PublicKeyHash({
          prevTxId: txid,
          outputIndex: outIdx,
          output: new Transaction.Output({
            satoshis: value,
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
}

export { WalletManager, WalletBuilder, WalletTools }
