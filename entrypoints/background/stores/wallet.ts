import assert from 'assert'
// Storage value types
type WxtStorageValueString = string
// Storage item definition types
type WxtStorageItemString = ReturnType<typeof storage.defineItem<WxtStorageValueString>>
type WxtStorageItem = WxtStorageItemString

export type WalletState = {
  seedPhrase: WxtStorageValueString
  xPrivkey: WxtStorageValueString
  signingKey: WxtStorageValueString
  address: WxtStorageValueString
  script: WxtStorageValueString
  utxos: WxtStorageValueString
  balance: WxtStorageValueString
}
export type MutableWalletState = Pick<WalletState, 'utxos' | 'balance'>
export type UIWalletState = Omit<WalletState, 'seedPhrase' | 'xPrivkey' | 'signingKey'>

export const DefaultWalletState: WalletState = {
  seedPhrase: '',
  xPrivkey: '',
  signingKey: '',
  address: '',
  script: '',
  utxos: '{}',
  balance: '0',
}

class WalletStore {
  private wxtStorageItems: Record<keyof WalletState, WxtStorageItem>

  constructor() {
    this.wxtStorageItems = {
      seedPhrase: storage.defineItem<WxtStorageValueString>('local:wallet:seedPhrase', {
        init: () => '',
      }),
      xPrivkey: storage.defineItem<WxtStorageValueString>('local:wallet:xPrivkey', {
        init: () => '',
      }),
      signingKey: storage.defineItem<WxtStorageValueString>('local:wallet:signingKey', {
        init: () => '',
      }),
      address: storage.defineItem<WxtStorageValueString>('local:wallet:address', {
        init: () => '',
      }),
      script: storage.defineItem<WxtStorageValueString>('local:wallet:script', {
        init: () => '',
      }),
      utxos: storage.defineItem<WxtStorageValueString>('local:wallet:utxos', {
        init: () => '',
      }),
      balance: storage.defineItem<WxtStorageValueString>('local:wallet:balance', {
        init: () => '0',
      }),
    }
  }
  get balanceStorageItem() {
    return this.wxtStorageItems.balance
  }
  hasSeedPhrase = async () => {
    return (await this.wxtStorageItems.seedPhrase.getValue()) ? true : false
  }
  saveMutableWalletState = async (state: MutableWalletState) => {
    console.log('saving immutable wallet state to localStorage')
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
        assert(item.value, `tried to get value for ${item.key}, got "${item.value}"`)
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
