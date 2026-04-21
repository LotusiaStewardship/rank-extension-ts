import type {
  MinerConfig,
  MinerStatus,
} from '@/entrypoints/background/stores/miner'
import type { LotusMiningSettings } from '@/entrypoints/background/miner/service'

export const OFFSCREEN_MINER_CHANNEL = 'lotusia:offscreen-miner' as const

export type OffscreenMinerCommandType =
  | 'ping'
  | 'start'
  | 'stop'
  | 'getStatus'
  | 'updateConfig'
  | 'shutdown'

export type OffscreenMinerCommandPayloadMap = {
  ping: undefined
  start: { settings: LotusMiningSettings }
  stop: undefined
  getStatus: undefined
  updateConfig: { settings: LotusMiningSettings }
  shutdown: undefined
}

export type OffscreenMinerCommand<T extends OffscreenMinerCommandType = OffscreenMinerCommandType> = {
  channel: typeof OFFSCREEN_MINER_CHANNEL
  kind: 'command'
  requestId: string
  command: T
  payload: OffscreenMinerCommandPayloadMap[T]
}

export type OffscreenMinerResponse<T = unknown> = {
  channel: typeof OFFSCREEN_MINER_CHANNEL
  kind: 'response'
  requestId: string
  ok: boolean
  data?: T
  error?: string
}

export type OffscreenMinerEvent =
  | {
      channel: typeof OFFSCREEN_MINER_CHANNEL
      kind: 'event'
      event: 'ready'
    }
  | {
      channel: typeof OFFSCREEN_MINER_CHANNEL
      kind: 'event'
      event: 'status'
      data: MinerStatus
    }
  | {
      channel: typeof OFFSCREEN_MINER_CHANNEL
      kind: 'event'
      event: 'error'
      data: { message: string }
    }

export function createDefaultMinerStatus(): MinerStatus {
  return {
    running: false,
    hashrate: 0,
    testedNonces: '0',
    webgpuSupported: false,
    lastError: '',
    updatedAt: Date.now(),
  }
}

export function mapConfigToMiningSettings(config: MinerConfig): LotusMiningSettings {
  return {
    mineToAddress: config.mineToAddress,
    rpc: {
      rpcUrl: config.rpcUrl,
      rpcUser: config.rpcUser,
      rpcPassword: config.rpcPassword,
    },
    gpuPreferences: config.gpuPreferences,
    rpcPollIntervalMs: config.rpcPollIntervalMs,
    iterations: config.iterations,
    kernelSize: config.kernelSize,
    hashrateWindowMs: config.hashrateWindowMs,
  }
}
