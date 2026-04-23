type WxtStorageItemObject<T> = ReturnType<typeof storage.defineItem<T>>
export type MinerGpuPreference = 'high-performance' | 'low-power'
export type MinerPowerProfile =
  | 'low-power'
  | 'balanced'
  | 'high-power'
  | 'custom'

export type MinerConfig = {
  rpcUrl: string
  rpcUser: string
  rpcPassword: string
  mineToAddress: string
  powerProfile: MinerPowerProfile
  gpuPreferences: MinerGpuPreference[]
  rpcPollIntervalMs: number
  iterations: number
  kernelSize: number
  hashrateWindowMs: number
}

export type MinerStatus = {
  running: boolean
  hashrate: number
  testedNonces: string
  /** WebGPU API availability in current runtime (`navigator.gpu`). */
  webgpuAvailable: boolean
  /** Adapter discovery status from most recent init attempt. */
  webgpuAdapterAvailable: boolean
  /** Device creation status from most recent init attempt. */
  webgpuDeviceReady: boolean
  /** Pipeline compilation status from most recent init attempt. */
  webgpuPipelineReady: boolean
  /** Back-compat summary used by existing UI paths. Equals `webgpuPipelineReady`. */
  webgpuSupported: boolean
  lastError: string
  updatedAt: number
}

export const DefaultMinerConfig: MinerConfig = {
  rpcUrl: 'http://127.0.0.1:10604',
  rpcUser: 'lotus',
  rpcPassword: 'lotus',
  mineToAddress: '',
  powerProfile: 'balanced',
  gpuPreferences: ['high-performance'],
  rpcPollIntervalMs: 3000,
  iterations: 16,
  kernelSize: MINER_DEFAULTS.DEFAULT_KERNEL_SIZE,
  hashrateWindowMs: 5000,
}

export const DefaultMinerStatus: MinerStatus = {
  running: false,
  hashrate: 0,
  testedNonces: '0',
  webgpuAvailable: false,
  webgpuAdapterAvailable: false,
  webgpuDeviceReady: false,
  webgpuPipelineReady: false,
  webgpuSupported: false,
  lastError: '',
  updatedAt: 0,
}

class MinerStore {
  private configStorageItem: WxtStorageItemObject<MinerConfig>
  private statusStorageItem: WxtStorageItemObject<MinerStatus>

  constructor() {
    this.configStorageItem = storage.defineItem<MinerConfig>(
      'local:miner:config',
      {
        init: () => ({ ...DefaultMinerConfig }),
      },
    )
    this.statusStorageItem = storage.defineItem<MinerStatus>(
      'local:miner:status',
      {
        init: () => ({ ...DefaultMinerStatus }),
      },
    )
  }

  get minerConfigStorageItem(): WxtStorageItemObject<MinerConfig> {
    return this.configStorageItem
  }

  get minerStatusStorageItem(): WxtStorageItemObject<MinerStatus> {
    return this.statusStorageItem
  }

  async getConfig(): Promise<MinerConfig> {
    return await this.configStorageItem.getValue()
  }

  async setConfig(config: MinerConfig): Promise<void> {
    await this.configStorageItem.setValue(config)
  }

  async patchConfig(partial: Partial<MinerConfig>): Promise<MinerConfig> {
    const current = await this.getConfig()
    const next = { ...current, ...partial }
    await this.setConfig(next)
    return next
  }

  async getStatus(): Promise<MinerStatus> {
    return await this.statusStorageItem.getValue()
  }

  async setStatus(status: MinerStatus): Promise<void> {
    await this.statusStorageItem.setValue(status)
  }

  async patchStatus(partial: Partial<MinerStatus>): Promise<MinerStatus> {
    const current = await this.getStatus()
    const next = { ...current, ...partial, updatedAt: Date.now() }
    await this.setStatus(next)
    return next
  }
}

export const minerStore = new MinerStore()
