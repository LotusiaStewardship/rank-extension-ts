type WxtStorageItemObject<T> = ReturnType<typeof storage.defineItem<T>>

export type MinerConfig = {
  rpcUrl: string
  rpcUser: string
  rpcPassword: string
  mineToAddress: string
  rpcPollIntervalMs: number
  iterations: number
  kernelSize: number
  hashrateWindowMs: number
}

export type MinerStatus = {
  running: boolean
  hashrate: number
  testedNonces: string
  webgpuSupported: boolean
  lastError: string
  updatedAt: number
}

export const DefaultMinerConfig: MinerConfig = {
  rpcUrl: 'http://127.0.0.1:10604',
  rpcUser: 'lotus',
  rpcPassword: 'lotus',
  mineToAddress: '',
  rpcPollIntervalMs: 3000,
  iterations: 16,
  kernelSize: 1 << 23,
  hashrateWindowMs: 5000,
}

export const DefaultMinerStatus: MinerStatus = {
  running: false,
  hashrate: 0,
  testedNonces: '0',
  webgpuSupported: false,
  lastError: '',
  updatedAt: 0,
}

class MinerStore {
  private configStorageItem: WxtStorageItemObject<MinerConfig>
  private statusStorageItem: WxtStorageItemObject<MinerStatus>

  constructor() {
    this.configStorageItem = storage.defineItem<MinerConfig>('local:miner:config', {
      init: () => ({ ...DefaultMinerConfig }),
    })
    this.statusStorageItem = storage.defineItem<MinerStatus>('local:miner:status', {
      init: () => ({ ...DefaultMinerStatus }),
    })
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
