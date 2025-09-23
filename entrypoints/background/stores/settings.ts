/**
 * Copyright 2025 The Lotusia Stewardship
 * Github: https://github.com/LotusiaStewardship
 * License: MIT
 */
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
export type SettingLocale = {
  name: SettingName
  label: string
  placeholder?: string
  helper: string
}
export type SettingName =
  | 'voteAmount'
  | 'autoBlurPosts'
  | 'autoHideProfiles'
  | 'autoHideThreshold'
  | 'autoHidePositiveVoteToggle'
  | 'autoHidePositiveVoteThreshold'
  | 'autoHideIfDownvoted'
export type SettingType = 'input' | 'select' | 'checkbox' | 'toggle' | 'slider'
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
  autoBlurPosts: {
    name: 'autoBlurPosts',
    type: 'toggle',
    value: 'true',
  },
  autoHideProfiles: {
    name: 'autoHideProfiles',
    type: 'toggle',
    value: 'true',
    subSettings: [
      'autoHideThreshold',
      'autoHidePositiveVoteThreshold',
      'autoHideIfDownvoted',
    ],
  },
  autoHideThreshold: {
    name: 'autoHideThreshold',
    type: 'input',
    value: '-5000', // -5,000 XPI
  },
  autoHidePositiveVoteToggle: {
    name: 'autoHidePositiveVoteToggle',
    type: 'toggle',
    value: 'true',
    subSettings: ['autoHidePositiveVoteThreshold'],
  },
  autoHidePositiveVoteThreshold: {
    name: 'autoHidePositiveVoteThreshold',
    type: 'slider',
    value: '50', // in percentage points
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
      autoBlurPosts: defineItem<WxtStorageValueObject>(
        'local:settings:autoBlurPosts',
        {
          init: () => DefaultExtensionSettings.autoBlurPosts,
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
      autoHidePositiveVoteToggle: defineItem<WxtStorageValueObject>(
        'local:settings:autoHidePositiveVoteToggle',
        {
          init: () => DefaultExtensionSettings.autoHidePositiveVoteToggle,
        },
      ),
      autoHidePositiveVoteThreshold: defineItem<WxtStorageValueObject>(
        'local:settings:autoHidePositiveVoteThreshold',
        {
          init: () => DefaultExtensionSettings.autoHidePositiveVoteThreshold,
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
  /**
   * Get the default extension settings
   * @returns {Record<SettingName, Setting>}
   */
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
   * Get the `autoBlurPosts` storage item
   * @returns {WxtStorageItemObject}
   */
  get autoBlurPostsStorageItem(): WxtStorageItemObject {
    return this.wxtStorageItems.autoBlurPosts as WxtStorageItemObject
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
   * Get the `autoHidePositiveVoteToggle` storage item
   * @returns {WxtStorageItemObject}
   */
  get autoHidePositiveVoteToggleStorageItem(): WxtStorageItemObject {
    return this.wxtStorageItems
      .autoHidePositiveVoteToggle as WxtStorageItemObject
  }
  /**
   * Get the `autoHidePositiveVoteThreshold` storage item
   * @returns {WxtStorageItemObject}
   */
  get autoHidePositiveVoteThresholdStorageItem(): WxtStorageItemObject {
    return this.wxtStorageItems
      .autoHidePositiveVoteThreshold as WxtStorageItemObject
  }
  /**
   * Get the `autoHideIfDownvoted` storage item
   * @returns {WxtStorageItemObject}
   */
  get autoHideIfDownvotedStorageItem(): WxtStorageItemObject {
    return this.wxtStorageItems.autoHideIfDownvoted as WxtStorageItemObject
  }
  /**
   * Get the `voteAmount` value
   * @returns {string}
   */
  async getVoteAmountSatoshis(): Promise<string> {
    const setting = await this.voteAmountStorageItem.getValue()
    return toSatoshiUnits(setting.value).toString()
  }
  /**
   * Get the `autoBlurPosts` value
   * @returns {boolean}
   */
  async getAutoBlurPosts(): Promise<boolean> {
    const setting = await this.autoBlurPostsStorageItem.getValue()
    return setting.value === 'true'
  }
  /**
   * Get the `autoHideProfiles` value
   * @returns {boolean}
   */
  async getAutoHideProfiles(): Promise<boolean> {
    const setting = await this.autoHideProfilesStorageItem.getValue()
    return setting.value === 'true'
  }
  /**
   * Get the `autoHideThreshold` value converted to satoshis
   * @returns {number}
   */
  async getAutoHideThresholdSatoshis(): Promise<string> {
    const setting = await this.autoHideThresholdStorageItem.getValue()
    return toSatoshiUnits(setting.value).toString()
  }
  /**
   * Get the `autoHidePositiveVoteToggle` value
   * @returns {boolean}
   */
  async getAutoHidePositiveVoteToggle(): Promise<boolean> {
    const setting = await this.autoHidePositiveVoteToggleStorageItem.getValue()
    return setting.value === 'true'
  }
  /**
   * Get the `autoHidePositiveVoteThreshold` value
   * @returns {string}
   */
  async getAutoHideUpvoteThresholdPercentage(): Promise<number> {
    const setting =
      await this.autoHidePositiveVoteThresholdStorageItem.getValue()
    return parseInt(setting.value)
  }
  /**
   * Get the `autoHideIfDownvoted` value
   * @returns {boolean}
   */
  async getAutoHideIfDownvoted(): Promise<boolean> {
    const setting = await this.autoHideIfDownvotedStorageItem.getValue()
    return setting.value === 'true'
  }
}

const settingsStore = new SettingsStore()
export { settingsStore }
