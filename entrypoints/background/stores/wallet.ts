import assert from 'assert'
// Storage value types
type WxtStorageValueString = string
type WxtStorageValueNumber = number
type WxtStorageValueObject = WalletBalance
// Storage item definition types
type WxtStorageItemString = ReturnType<
  typeof storage.defineItem<WxtStorageValueString>
>
type WxtStorageItemNumber = ReturnType<
  typeof storage.defineItem<WxtStorageValueNumber>
>
type WxtStorageItemObject = ReturnType<
  typeof storage.defineItem<WxtStorageValueObject>
>
type WxtStorageItem =
  | WxtStorageItemString
  | WxtStorageItemNumber
  | WxtStorageItemObject

/** Object containing the total, spendable, and immature balances of the wallet */
export type WalletBalance = {
  /** Sum of spendable and immature balance */
  total: string
  /** Spendable (i.e. mature) balance of the wallet in satoshis */
  spendable: string
}
export type WalletState = {
  seedPhrase: WxtStorageValueString
  xPrivkey: WxtStorageValueString
  signingKey: WxtStorageValueString
  address: WxtStorageValueString
  scriptPayload: WxtStorageValueString
  scriptHex: WxtStorageValueString
  utxos: WxtStorageValueString
  balance: WalletBalance
  tipHeight: WxtStorageValueNumber
  tipHash: WxtStorageValueString
}
export type ChainState = Pick<WalletState, 'tipHeight' | 'tipHash'>
export type MutableWalletState = Pick<WalletState, 'utxos' | 'balance'>
export type UIWalletState = Omit<
  WalletState,
  'seedPhrase' | 'xPrivkey' | 'signingKey'
>

export const DefaultWalletState: WalletState = {
  seedPhrase: '',
  xPrivkey: '',
  signingKey: '',
  address: '',
  scriptPayload: '',
  scriptHex: '',
  utxos: '[]',
  balance: {
    total: '0',
    spendable: '0',
  },
  tipHeight: 0,
  tipHash: '',
}

class WalletStore {
  private wxtStorageItems: Record<keyof WalletState, WxtStorageItem>

  constructor() {
    this.wxtStorageItems = {
      seedPhrase: storage.defineItem<WxtStorageValueString>(
        'local:wallet:seedPhrase',
        {
          init: () => '',
        },
      ),
      xPrivkey: storage.defineItem<WxtStorageValueString>(
        'local:wallet:xPrivkey',
        {
          init: () => '',
        },
      ),
      signingKey: storage.defineItem<WxtStorageValueString>(
        'local:wallet:signingKey',
        {
          init: () => '',
        },
      ),
      address: storage.defineItem<WxtStorageValueString>(
        'local:wallet:address',
        {
          init: () => '',
        },
      ),
      scriptHex: storage.defineItem<WxtStorageValueString>(
        'local:wallet:scriptHex',
        {
          init: () => '',
        },
      ),
      scriptPayload: storage.defineItem<WxtStorageValueString>(
        'local:wallet:scriptPayload',
        {
          init: () => '',
        },
      ),
      utxos: storage.defineItem<WxtStorageValueString>('local:wallet:utxos', {
        init: () => '[]',
      }),
      balance: storage.defineItem<WxtStorageValueObject>(
        'local:wallet:balance',
        {
          init: () => ({
            total: '0',
            spendable: '0',
          }),
        },
      ),
      tipHeight: storage.defineItem<WxtStorageValueNumber>(
        'local:wallet:tipHeight',
        {
          init: () => 0,
        },
      ),
      tipHash: storage.defineItem<WxtStorageValueString>(
        'local:wallet:tipHash',
        {
          init: () => '',
        },
      ),
    }
  }
  async setScripthex(scriptHex: string) {
    const scriptHexItem = this.wxtStorageItems.scriptHex as WxtStorageItemString
    await scriptHexItem.setValue(scriptHex)
  }
  async setScriptPayload(scriptPayload: string) {
    const scriptPayloadItem = this.wxtStorageItems
      .scriptPayload as WxtStorageItemString
    await scriptPayloadItem.setValue(scriptPayload)
  }
  /** 20-byte P2PKH script payload */
  async getScriptPayload() {
    return await this.wxtStorageItems.scriptPayload.getValue()
  }
  /** Popup UI and content script tracks changes to script payload */
  get scriptPayloadStorageItem() {
    return this.wxtStorageItems.scriptPayload
  }
  /** Popup UI tracks changes to balance */
  get balanceStorageItem() {
    return this.wxtStorageItems.balance
  }
  /** Popup UI tracks changes to tip height */
  get tipHeightStorageItem() {
    return this.wxtStorageItems.tipHeight
  }
  /** Popup UI tracks changes to tip hash */
  get tipHashStorageItem() {
    return this.wxtStorageItems.tipHash
  }
  /** Returns `true` if a wallet has already been initialized, `false` otherwise */
  hasSeedPhrase = async () => {
    return Boolean(await this.wxtStorageItems.seedPhrase.getValue())
  }
  /**
   *
   * @param state
   */
  saveMutableWalletState = async (state: MutableWalletState) => {
    console.log('saving mutable wallet state to localStorage')
    try {
      await storage.setItems(
        (Object.keys(state) as Array<keyof MutableWalletState>).map(key => ({
          item: this.wxtStorageItems[key],
          value: state[key],
        })),
      )
    } catch (e) {
      console.error(`saveMutableWalletState: ${e}`)
    }
  }
  /**
   * Save the blockchain state to localStorage
   * @param state The chain state to save
   */
  saveChainState = async (state: ChainState) => {
    console.log('saving chain state to localStorage')
    try {
      await storage.setItems(
        (Object.keys(state) as Array<keyof ChainState>).map(key => ({
          item: this.wxtStorageItems[key],
          value: state[key],
        })),
      )
    } catch (e) {
      console.error(`saveChainState: ${e}`)
    }
  }
  /**
   *
   * @param state
   */
  saveWalletState = async (state: WalletState) => {
    console.log('saving complete wallet state to localStorage')
    try {
      await storage.setItems(
        (Object.keys(state) as Array<keyof WalletState>).map(key => ({
          item: this.wxtStorageItems[key],
          value: state[key],
        })),
      )
    } catch (e) {
      console.error(`saveWalletState: ${e}`)
    }
  }
  /**
   *
   * @returns
   */
  loadWalletState = async () => {
    try {
      const walletStoreItems = await storage.getItems(
        (Object.keys(this.wxtStorageItems) as Array<keyof WalletState>).map(
          key => this.wxtStorageItems[key],
        ),
      )
      const walletState: Partial<WalletState> = {}
      while (walletStoreItems.length > 0) {
        // storage.getItems() guarantees order of data, so Array.shift() is safe
        const item = walletStoreItems.shift()
        assert(item, 'item is undefined.. corrupt walletStore?')
        const storeKey = item.key.split(':').pop() as keyof WalletState
        assert(storeKey, `walletStore key incorrectly formatted: ${storeKey}`)
        // disabling this assertion fixes localStorage regression introduced in 0.4.0-alpha (i.e. scriptHex, scriptPayload)
        //assert(item.value, `tried to get value for ${item.key}, got "${item.value}"`)
        switch (storeKey) {
          case 'balance':
            walletState[storeKey] = item.value as WxtStorageValueObject
            break
          case 'tipHeight':
            walletState[storeKey] = item.value as WxtStorageValueNumber
            break
          // default to string storage values
          default:
            walletState[storeKey] = item.value as WxtStorageValueString
            break
        }
      }
      return walletState as WalletState
    } catch (e) {
      console.error(`loadWalletState: ${e}`)
    }
  }
}

const walletStore = new WalletStore()
export { walletStore }
