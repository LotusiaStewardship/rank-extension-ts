import assert from 'assert'
import { toSatoshiUnits } from '@/utils/functions'
const { defineItem, setItem, setItems, getItem, getItems } = storage
// Storage value types
type WxtStorageValueString = string
type WxtStorageValueObject = Setting
// Storage item definition types
type WxtStorageItemString = ReturnType<typeof defineItem<WxtStorageValueString>>
type WxtStorageItemObject = ReturnType<typeof defineItem<WxtStorageValueObject>>
type WxtStorageItem = WxtStorageItemString | WxtStorageItemObject
// Local types
export type SettingName =
  | 'voteAmount'
  | 'autoHideProfiles'
  | 'autoHideThreshold'
  | 'autoHideIfDownvoted'
export type SettingType = 'input' | 'select' | 'checkbox' | 'toggle'
export type Setting = {
  name: SettingName
  type: SettingType
  value: string
  subSettings?: SettingName[]
}

/** Default extension settings */
export const DefaultExtensionSettings: Record<SettingName, Setting> = {
  voteAmount: {
    name: 'voteAmount',
    type: 'input',
    value: '100', // 100 XPI
  },
  autoHideProfiles: {
    name: 'autoHideProfiles',
    type: 'toggle',
    value: 'true',
    subSettings: ['autoHideThreshold', 'autoHideIfDownvoted'],
  },
  autoHideThreshold: {
    name: 'autoHideThreshold',
    type: 'input',
    value: '-5000', // -5,000 XPI
  },
  autoHideIfDownvoted: {
    name: 'autoHideIfDownvoted',
    type: 'toggle',
    value: 'true',
  },
}
/**
 *
 */
class SettingsStore {
  private wxtStorageItems: Record<SettingName, WxtStorageItem>
  /**
   * Constructor for the SettingsStore
   */
  constructor() {
    this.wxtStorageItems = {
      voteAmount: defineItem<WxtStorageValueObject>(
        'local:settings:voteAmount',
        {
          init: () => DefaultExtensionSettings.voteAmount,
        },
      ),
      autoHideProfiles: defineItem<WxtStorageValueObject>(
        'local:settings:autoHideProfiles',
        {
          init: () => DefaultExtensionSettings.autoHideProfiles,
        },
      ),
      autoHideThreshold: defineItem<WxtStorageValueObject>(
        'local:settings:autoHideThreshold',
        {
          init: () => DefaultExtensionSettings.autoHideThreshold,
        },
      ),
      autoHideIfDownvoted: defineItem<WxtStorageValueObject>(
        'local:settings:autoHideIfDownvoted',
        {
          init: () => DefaultExtensionSettings.autoHideIfDownvoted,
        },
      ),
    }
  }
  get defaultExtensionSettings(): Record<SettingName, Setting> {
    return DefaultExtensionSettings
  }
  /**
   * Get the `voteAmount` storage item
   * @returns {WxtStorageItemObject}
   */
  get voteAmountStorageItem(): WxtStorageItemObject {
    return this.wxtStorageItems.voteAmount as WxtStorageItemObject
  }
  /**
   * Get the `autoHideProfiles` storage item
   * @returns {WxtStorageItemObject}
   */
  get autoHideProfilesStorageItem(): WxtStorageItemObject {
    return this.wxtStorageItems.autoHideProfiles as WxtStorageItemObject
  }
  /**
   * Get the `autoHideThreshold` storage item
   * @returns {WxtStorageItemObject}
   */
  get autoHideThresholdStorageItem(): WxtStorageItemObject {
    return this.wxtStorageItems.autoHideThreshold as WxtStorageItemObject
  }
  /**
   * Get the `autoHideIfDownvoted` storage item
   * @returns {WxtStorageItemObject}
   */
  get autoHideIfDownvotedStorageItem(): WxtStorageItemObject {
    return this.wxtStorageItems.autoHideIfDownvoted as WxtStorageItemObject
  }
  /**
   * Get the `autoHideThreshold` value converted to satoshis
   * @returns {number}
   */
  async getAutoHideThresholdSatoshis(): Promise<string> {
    const setting = await this.autoHideThresholdStorageItem.getValue()
    return toSatoshiUnits(setting.value).toString()
  }
}

const settingsStore = new SettingsStore()
export { settingsStore }
