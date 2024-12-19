// @ts-ignore
import Mnemonic from '@abcpros/bitcore-mnemonic'
import { HDPrivateKey, Script, Address, PrivateKey } from '@abcpros/bitcore-lib-xpi'
import { ChronikClient, SubscribeMsg, WsEndpoint } from 'chronik-client'
import { walletStore, WalletState } from '@/entrypoints/background/stores'
import { assert } from 'console'

const WALLET_BIP44_PURPOSE = 44
const WALLET_BIP44_COINTYPE = 10605
const WALLET_CHRONIK_URL = 'https://chronik.lotusia.org'

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

class WalletBuilder implements WalletBuilder {
  static buildWalletState = (seedPhrase: string): WalletState => {
    const mnemonic = this.mnemonicFromSeedPhrase(seedPhrase)
    const hdPrivkey = this.hdPrivkeyFromMnemonic(mnemonic)
    const signingKey = this.deriveSigningKey(hdPrivkey)
    const script = this.scriptFromAddress(signingKey.toAddress())

    assert(mnemonic, 'unable to get Mnemonic from seedPhrase')
    assert(hdPrivkey, 'unable to generate HDPrivateKey from Mnemonic')
    assert(signingKey, 'unable to derive PrivateKey from HDPrivateKey')
    assert(script, 'unable to parse Script from PrivateKey/Address')

    return {
      seedPhrase: seedPhrase,
      xPrivkey: hdPrivkey.toString(),
      signingKey: signingKey.toWIF(),
      script: script.toHex().toString(),
      utxos: {},
      balance: '0',
    }
  }
  static newMnemonic = () => new Mnemonic() as Mnemonic
  static mnemonicFromSeedPhrase = (seedPhrase: string) => new Mnemonic(seedPhrase)
  static mnemonicFromSeed = (seed: Buffer) => Mnemonic.fromSeed(seed)
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

class Wallet {
  private chronik: ChronikClient
  private ws: WsEndpoint

  constructor() {
    this.chronik = new ChronikClient(WALLET_CHRONIK_URL)
    this.ws = this.chronik.ws({
      onConnect: this.wsSubscribe,
      onMessage: this.wsMessage,
    })
  }
  wsSubscribe = () => {}
  wsMessage = (msg: SubscribeMsg) => {
    switch (msg.type) {
      case 'AddedToMempool':
        break
      case 'Confirmed':
        break
      default:
        return
    }
  }
  scriptPayloadWs = (scriptPayload: string, action: 'subscribe' | 'unsubscribe') => {
    this.ws[action]('p2pkh', scriptPayload)
  }
}

export { Wallet, WalletBuilder }
