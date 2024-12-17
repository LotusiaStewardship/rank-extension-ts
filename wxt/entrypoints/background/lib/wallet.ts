import { HDPrivateKey } from '@abcpros/bitcore-lib-xpi'
// @ts-ignore
import Mnemonic from '@abcpros/bitcore-mnemonic'

const PURPOSE = 44
const COINTYPE = 10605

class Wallet {
  /** Generate 12-word phrase to seed the `HDPrivateKey` */
  public static newMnemonicPhrase = () => new Mnemonic() as string
  /** Converts `Mnemonic` to seed and imports as `HDPrivateKey` */
  public static getHdPrivkeyFromMnemonic = (mnemonic: Mnemonic) =>
    HDPrivateKey.fromSeed(mnemonic.toSeed())
  /** Get the `PrivateKey` for BIP44 path `m/44'/10605'/0'/0/0` */
  public static getDefaultPrivkey = (hdPrivkey: HDPrivateKey) =>
    hdPrivkey
      .deriveChild(PURPOSE, true)
      .deriveChild(COINTYPE, true)
      .deriveChild(0, true)
      .deriveChild(0)
      .deriveChild(0).privateKey
}

export { Wallet }
