import { Utxo } from 'chronik-client'
import assert from 'assert'
// Storage value types
type WxtStorageValueString = string | null
type WxtStorageValueRecord = Record<string, Utxo>
type WxtStorageValue = WxtStorageValueString | WxtStorageValueRecord
// Storage item definition types
type WxtStorageItemString = ReturnType<
  typeof storage.defineItem<WxtStorageValueString>
>
type WxtStorageItemRecord = ReturnType<
  typeof storage.defineItem<WxtStorageValueRecord>
>
type WxtStorageItem = WxtStorageItemString | WxtStorageItemRecord

export type WalletState = {
  seedPhrase: WxtStorageValueString
  xPrivkey: WxtStorageValueString
  signingKey: WxtStorageValueString
  script: WxtStorageValueString
  utxos: WxtStorageValueRecord
  balance: WxtStorageValueString
}

export const DefaultWalletState: WalletState = {
  seedPhrase: null,
  xPrivkey: null,
  signingKey: null,
  script: null,
  utxos: {},
  balance: '0',
}

class WalletStore {
  wxtStorageItems: Record<keyof WalletState, WxtStorageItem>

  constructor() {
    this.wxtStorageItems = {
      seedPhrase: storage.defineItem<string>('local:wallet:seedPhrase'),
      xPrivkey: storage.defineItem<string>('local:wallet:xPrivkey'),
      signingKey: storage.defineItem<string>('local:wallet:signingKey'),
      script: storage.defineItem<string>('local:wallet:script'),
      utxos: storage.defineItem<Record<string, Utxo>>('local:wallet:utxos', {
        init: () => ({}),
      }),
      balance: storage.defineItem<string>('local:wallet:balance', {
        init: () => '0',
      }),
    }
  }
  saveWalletState = async (wallet: WalletState) => {
    try {
      await storage.setItems(
        (Object.keys(wallet) as Array<keyof WalletState>).map(key => ({
          item: this.wxtStorageItems[key],
          value: wallet[key],
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
        const item = walletStoreItems.shift()
        assert(item, 'item is undefined.. corrupt walletStore?')
        assert(
          item.value,
          `tried to get value for ${item.key}, got ${item.value}`,
        )
        const storeKey = item.key.split(':').pop() as keyof WalletState
        assert(storeKey, `walletStore key incorrectly formatted: ${storeKey}`)
        switch (storeKey) {
          case 'seedPhrase':
          case 'xPrivkey':
          case 'signingKey':
          case 'script':
          case 'balance':
            walletState[storeKey] =
              item.value as NonNullable<WxtStorageValueString>
            continue
          case 'utxos':
            walletState.utxos = item.value as WxtStorageValueRecord
            continue
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
