// @ts-ignore
import Mnemonic from '@abcpros/bitcore-mnemonic'
import type { ScriptChunkPlatformUTF8, ScriptChunkSentimentUTF8 } from 'rank-lib'
import { toPlatformBuf, toProfileIdBuf, toPostIdBuf, toSentimentOpCode } from 'rank-lib'
import {
  HDPrivateKey,
  Script,
  PrivateKey,
  Transaction,
  Address,
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
} from 'chronik-client'
import assert from 'assert'
import { serialize, deserialize } from '@/utils/functions'
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
  platform: ScriptChunkPlatformUTF8
  profileId: string
  sentiment: ScriptChunkSentimentUTF8
  postId?: string
  comment?: string
}
type EventData = string | SendTransactionParams | RankTransactionParams | undefined
/** Messaging events between popup and background service worker */
type EventProcessor = (data: EventData) => Promise<void>
/** A queued `EventProcessor` that is scheduled to be resolved at next `processQueue` call */
type PendingEventProcessor = [EventProcessor, EventData]
/** Runtime queue to store `PendingEventProcessor` until they are called */
type EventQueue = {
  busy: boolean
  pending: PendingEventProcessor[]
}
type Utxo = {
  outIdx: number
  value: string
}
export type UtxoCache = Map<string, Utxo> // Map key is txid

type Wallet = {
  seedPhrase: string
  xPrivkey: HDPrivateKey
  signingKey: PrivateKey
  address: Address
  script: Script
  utxos: UtxoCache
  balance: string
}

interface WalletBuilder {
  buildWalletState: (seedPhrase: string) => WalletState
  newMnemonic: () => Mnemonic
  mnemonicFromSeedPhrase: (seedPhrase: string) => Mnemonic
  mnemonicFromSeed: (seed: Buffer) => Mnemonic
  hdPrivkeyFromMnemonic: (mnemonic: Mnemonic) => HDPrivateKey
  deriveSigningKey: (hdPrivkey: HDPrivateKey) => PrivateKey
  scriptFromAddress: (address: string | Address) => Script
  scriptFromString: (script: string) => Script
}
/**
 *
 */
class WalletBuilder implements WalletBuilder {
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
      script: script.toHex(),
      utxos: serialize(utxos),
      balance: '0',
    }
  }
  static newMnemonic = () => new Mnemonic() as Mnemonic
  static mnemonicFromSeedPhrase = (seedPhrase: string) =>
    new Mnemonic(seedPhrase) as Mnemonic
  static mnemonicFromSeed = (seed: Buffer) => Mnemonic.fromSeed(seed) as Mnemonic
  static hdPrivkeyFromMnemonic = (mnemonic: Mnemonic) =>
    HDPrivateKey.fromSeed(mnemonic.toSeed())
  static deriveSigningKey = (hdPrivkey: HDPrivateKey, path?: string) =>
    hdPrivkey
      .deriveChild(WALLET_BIP44_PURPOSE, true)
      .deriveChild(WALLET_BIP44_COINTYPE, true)
      .deriveChild(0, true)
      .deriveChild(0)
      .deriveChild(0).privateKey
  static scriptFromAddress = (address: string | Address) =>
    Script.fromAddress(address) ?? null
  static scriptFromString = (script: string) => Script.fromString(script)
}
/**
 *
 */
class WalletManager {
  private chronik!: ChronikClient
  private ws!: WsEndpoint
  private scriptEndpoint!: ScriptEndpoint
  private wallet!: Wallet
  public queue: EventQueue

  constructor() {
    this.queue = {
      busy: false,
      pending: [],
    }
  }
  /** 20-byte public key hash to register Chronik `ScriptEndpoint` */
  get scriptPayload() {
    return this.wallet.script.getData().toString('hex')
  }
  /** Hex-encoded output script for various bitcore-lib-xpi operations */
  get scriptHex() {
    return this.wallet.script.toHex()
  }
  get outpoints() {
    const outpoints: OutPoint[] = []
    this.wallet.utxos.forEach(({ outIdx }, txid) => outpoints.push({ txid, outIdx }))
    return outpoints
  }
  /** Wallet state that gets saved to localStorage when changed */
  get mutableWalletState(): MutableWalletState {
    return {
      utxos: serialize(this.wallet.utxos),
      balance: this.wallet.balance,
    }
  }
  /** Wallet state that gets sent to popup UI and potentially used elsewhere */
  get uiWalletState(): UIWalletState {
    return {
      address: this.wallet.address.toXAddress(),
      script: this.wallet.script.toHex(),
      utxos: serialize(this.wallet.utxos),
      balance: this.wallet.balance,
    }
  }
  /** Complete wallet state */
  get walletState(): WalletState {
    return {
      seedPhrase: this.wallet.seedPhrase,
      xPrivkey: this.wallet.xPrivkey.toString(),
      signingKey: this.wallet.signingKey.toWIF(),
      address: this.wallet.address.toXAddress(),
      script: this.wallet.script.toHex(),
      utxos: serialize(this.wallet.utxos),
      balance: this.wallet.balance,
    }
  }
  /** Deserialize the stored `WalletState` for runtime application, and connect Chronik API/WebSocket */
  init = async (walletState: WalletState) => {
    // initialize the wallet from the existing state
    this.wallet = {
      seedPhrase: walletState.seedPhrase,
      xPrivkey: HDPrivateKey.fromString(walletState.xPrivkey),
      signingKey: PrivateKey.fromWIF(walletState.signingKey),
      address: Address.fromString(walletState.address),
      script: Script.fromString(walletState.script),
      utxos: deserialize(walletState.utxos),
      balance: walletState.balance,
    }
    // initialize Chronik API and websocket
    this.chronik = new ChronikClient(WALLET_CHRONIK_URL)
    this.ws = this.chronik.ws({
      onConnect: () => console.log(`chronik websocket connected`, this.ws.ws?.url),
      onMessage: this.onWsMessage,
      onError: e => console.error('chronik websocket error', e),
      onEnd: e => console.error('chronik websocket ended abruptly', e),
      onReconnect: e => console.warn('chronik websocket reconnected', e),
    })
    this.scriptEndpoint = this.chronik.script('p2pkh', this.scriptPayload)
    // wait for websocket connection established
    await this.wsWaitForOpen()
    // fetch existing utxo set to bootstrap wallet
    await this.fetchScriptUtxoSet()
    // subscribe for updates to primary wallet address (script)
    this.wsSubscribeP2PKH(this.scriptPayload)
  }
  private onWsMessage = (msg: SubscribeMsg) => {
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
    this.resolveQueuedEventProcessors()
  }
  private processQueue = async (): Promise<void> => {
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
    } finally {
      if (this.queue.pending.length > 0) {
        return this.processQueue()
      }
    }
    // save updated wallet state
    await walletStore.saveMutableWalletState(this.mutableWalletState)
    this.queue.busy = false
  }
  /** Try to resolve the queued `EventProcessor`s if not already busy doing so */
  resolveQueuedEventProcessors = () => {
    if (!this.queue.busy) {
      return this.processQueue()
    }
  }
  handleWsAddedToMempool: EventProcessor = async (data: EventData) => {
    const txid = data as string
    const tx = await this.chronik.tx(txid)
    for (let i = 0; i < tx.outputs.length; i++) {
      const output = tx.outputs[i]
      if (this.scriptHex == output.outputScript) {
        console.log(
          `AddedToMempool: received ${toXPI(output.value)} Lotus, saving utxo to cache`,
        )
        // calculate total balance with new output
        const balance = BigInt(this.wallet.balance)
        const value = BigInt(output.value)
        // add new data to wallet state
        this.wallet.balance = (balance + value).toString()
        this.wallet.utxos.set(txid, { outIdx: i, value: output.value })
        break
      }
    }
  }
  handlePopupSubmitRankVote: EventProcessor = async (data: EventData) => {
    const { platform, profileId, sentiment, postId, comment } =
      data as RankTransactionParams
    try {
      const { txid } = await this.broadcastTx(
        this.craftRankTx(platform, profileId, sentiment, postId, comment).toBuffer(),
      )
      console.log(`successfully cast ${sentiment} vote for ${platform}/${profileId}`)
      await this.reconcileUtxos()
    } catch (e) {
      console.error(`failed to cast ${sentiment} vote for ${platform}/${profileId}`, e)
    }
  }
  handlePopupSendLotus: EventProcessor = async (data: EventData) => {
    const { outAddress, outValue } = data as SendTransactionParams
    try {
      const { txid } = await this.broadcastTx(
        this.craftSendTx(outAddress, outValue).toBuffer(),
      )
      console.log(`Lotus sent successfully`, txid)
      // schedule utxo reconciliation immediately
      this.queue.pending.unshift([this.reconcileUtxos, undefined])
    } catch (e) {
      console.error(`failed to send ${outValue} sats to ${outAddress}`, e)
    }
  }
  private reconcileUtxos: EventProcessor = async () => {
    const results = await this.chronik.validateUtxos(this.outpoints)
    const invalid: OutPoint[] = []
    let spentBalance = 0n
    for (let i = 0; i < results.length; i++) {
      const { txid, outIdx } = this.outpoints[i]
      const { state } = results[i]
      switch (state) {
        case 'NO_SUCH_OUTPUT':
        case 'NO_SUCH_TX':
        case 'SPENT':
          console.log(
            `validateUtxos: removing utxo "${txid}_${outIdx}" from cache due to state "${state}"`,
          )
          invalid.push({ txid, outIdx })
          spentBalance += BigInt(this.wallet.utxos.get(txid)!.value)
      }
    }
    invalid.forEach(outpoint => this.wallet.utxos.delete(outpoint.txid))
    this.wallet.balance = (BigInt(this.wallet.balance) - spentBalance).toString()
  }
  wsWaitForOpen = async () => {
    await this.ws.waitForOpen()
  }
  wsSubscribeP2PKH = (scriptPayload: string) => this.ws.subscribe('p2pkh', scriptPayload)
  wsUnsubscribeP2PKH = (scriptPayload: string) =>
    this.ws.unsubscribe('p2pkh', scriptPayload)
  fetchScriptUtxoSet = async () => {
    try {
      const [{ utxos }] = await this.scriptEndpoint.utxos()
      let balance = 0n
      utxos.map(({ outpoint, value }) => {
        const { txid, outIdx } = outpoint
        balance += BigInt(value)
        this.wallet.utxos.set(txid, { outIdx, value })
      })
      this.wallet.balance = balance.toString()
      // save updated wallet state
      await walletStore.saveMutableWalletState(this.mutableWalletState)
    } catch (e) {
      // no need for special error handling here
      // if we fail to get the utxos for the wallet script, we likely
      // have bigger problems
    }
  }
  private broadcastTx = async (txBuf: Buffer) => {
    return await this.chronik.broadcastTx(txBuf)
  }
  private craftRankTx = (
    platform: ScriptChunkPlatformUTF8,
    profileId: string,
    sentiment: ScriptChunkSentimentUTF8,
    postId?: string,
    comment?: string,
  ) => {
    const tx = new Transaction()
    // set some default tx params
    tx.feePerByte(2)
    tx.change(this.wallet.address)
    // gather utxos until we have more than outValue
    for (const [txid, utxo] of this.wallet.utxos) {
      const { outIdx, value } = utxo
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
      // don't use anymore inputs if we have enough value already
      if (tx.inputAmount > RANK_OUTPUT_MIN_VALUE) {
        break
      }
    }

    // Add RANK chunks to output script
    const rankScript = new Script('')
    rankScript.add('OP_RETURN')
    rankScript.add(Buffer.from('RANK'))
    // Add sentiment opcode
    rankScript.add(toSentimentOpCode(sentiment))
    // Add platform byte
    rankScript.add(toPlatformBuf(platform))
    // Add profielId bytes
    rankScript.add(toProfileIdBuf(platform, profileId))
    // Add postId bytes if applicable
    if (postId) {
      rankScript.add(toPostIdBuf(platform, postId))
    }
    // Add the RANK output to the tx
    tx.addOutput(
      new Transaction.Output({
        // TODO: use user-defined value; fallback to default
        satoshis: RANK_OUTPUT_MIN_VALUE,
        script: rankScript,
      }),
    )
    /*
    if (comment) {
      // TODO: add comment bytes to 2nd OP_RETURN output
    }
    */
    // Finalize tx
    tx.sign(this.wallet.signingKey)
    const verified = tx.verify()
    switch (typeof verified) {
      case 'boolean':
        return tx
      case 'string':
        throw new Error(
          `craftRankTx produced an invalid transaction: ${verified}\r\n${tx.toJSON().toString()}`,
        )
    }
  }
  private craftSendTx = (outAddress: string, outValue: number): Transaction => {
    const tx = new Transaction()
    // set some default tx params
    tx.feePerByte(2)
    tx.change(this.wallet.address)
    // gather utxos until we have more than outValue
    for (const [txid, utxo] of this.wallet.utxos) {
      const { outIdx, value } = utxo
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
        return tx
      case 'string':
        throw new Error(
          `craftSendTx produced an invalid transaction: ${verified}\r\n${tx.toJSON().toString()}`,
        )
    }
  }
}

export { WalletManager, WalletBuilder }
