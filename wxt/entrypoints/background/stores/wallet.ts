import { Utxo } from 'chronik-client'
import { assert } from 'console'

type WxtStorageItemKeyAddress = ReturnType<typeof storage.defineItem<string | null>>
type WxtStorageItemUtxo = ReturnType<typeof storage.defineItem<Record<string, Utxo>>>
type WxtStorageItemBalance = ReturnType<typeof storage.defineItem<string>>
type WxtStorageItem =
  | WxtStorageItemKeyAddress
  | WxtStorageItemUtxo
  | WxtStorageItemBalance

type WxtStorageValueKeyAddress = Awaited<ReturnType<WxtStorageItemKeyAddress['getValue']>>
type WxtStorageValueUtxos = Awaited<ReturnType<WxtStorageItemUtxo['getValue']>>
type WxtStorageValueBalance = Awaited<ReturnType<WxtStorageItemBalance['getValue']>>
type WxtStorageValue =
  | WxtStorageValueKeyAddress
  | WxtStorageValueUtxos
  | WxtStorageValueBalance

export type WalletState = {
  seedPhrase: WxtStorageValueKeyAddress
  xPrivkey: WxtStorageValueKeyAddress
  signingKey: WxtStorageValueKeyAddress
  script: WxtStorageValueKeyAddress
  utxos: WxtStorageValueUtxos
  balance: WxtStorageValueBalance
}

export type LoadedWalletState = Awaited<ReturnType<WalletStore['loadWalletState']>>

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
      // Doing a shift() over getItems() is safe because order is guaranteed
      return {
        seedPhrase: walletStoreItems.shift()
          ?.value as NonNullable<WxtStorageValueKeyAddress>,
        xPrivkey: walletStoreItems.shift()
          ?.value as NonNullable<WxtStorageValueKeyAddress>,
        signingKey: walletStoreItems.shift()
          ?.value as NonNullable<WxtStorageValueKeyAddress>,
        script: walletStoreItems.shift()?.value as NonNullable<WxtStorageValueKeyAddress>,
        utxos: walletStoreItems.shift()?.value as WxtStorageValueUtxos,
        balance: walletStoreItems.shift()?.value as WxtStorageValueBalance,
      }
    } catch (e) {
      console.error(`loadWalletState: ${e}`)
    }
  }
}

const walletStore = new WalletStore()
export { walletStore }
