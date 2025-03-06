import assert from 'assert'
// Storage value types
type WxtStorageValueString = string
// Storage item definition types
type WxtStorageItemString = ReturnType<
  typeof storage.defineItem<WxtStorageValueString>
>
type WxtStorageItem = WxtStorageItemString

export type WalletState = {
  seedPhrase: WxtStorageValueString
  xPrivkey: WxtStorageValueString
  signingKey: WxtStorageValueString
  address: WxtStorageValueString
  scriptPayload: WxtStorageValueString
  scriptHex: WxtStorageValueString
  utxos: WxtStorageValueString
  balance: WxtStorageValueString
}
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
  utxos: '{}',
  balance: '0',
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
        init: () => serialize(new Map()),
      }),
      balance: storage.defineItem<WxtStorageValueString>(
        'local:wallet:balance',
        {
          init: () => '0',
        },
      ),
    }
  }
  async setScripthex(scriptHex: string) {
    await this.wxtStorageItems.scriptHex.setValue(scriptHex)
  }
  async setScriptPayload(scriptPayload: string) {
    await this.wxtStorageItems.scriptPayload.setValue(scriptPayload)
  }
  async getScriptPayload() {
    return await this.wxtStorageItems.scriptPayload.getValue()
  }
  /** Popup UI tracks changes to balance */
  get balanceStorageItem() {
    return this.wxtStorageItems.balance
  }
  /**
   * Popup UI tracks changes to address, e.g. import new seed phrase
   *
   * This is useful for updating the `scriptPayload` value in the `instanceStore`
   */
  get addressStorageItem() {
    return this.wxtStorageItems.address
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
        // fixes localStorage regression introduced in 0.4.0-alpha (i.e. scriptHex, scriptPayload)
        //assert(item.value, `tried to get value for ${item.key}, got "${item.value}"`)
        walletState[storeKey] = item.value as WxtStorageValueString
      }
      return walletState as WalletState
    } catch (e) {
      console.error(`loadWalletState: ${e}`)
    }
  }
}

const walletStore = new WalletStore()
export { walletStore }
