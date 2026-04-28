/**
 * Communication protocol definitions
 */
import type { MinerConfig, MinerStatus } from '@/entrypoints/background/stores'
// ==================================================
// Offscreen Protocol (background sw <-> offscreen)
// ==================================================
/** Runtime message channel for background <-> offscreen document control-plane traffic. */
export const OFFSCREEN_MINER_CHANNEL = 'lotusia:offscreen-miner' as const

/** Commands accepted by the offscreen document controller endpoint. */
export type OffscreenMinerCommandType =
  | 'ping'
  | 'start'
  | 'stop'
  | 'getStatus'
  | 'updateConfig'
  | 'shutdown'

/** Per-command payload contract. */
export type OffscreenMinerCommandPayloadMap = {
  ping: undefined
  start: { settings: LotusMiningSettings }
  stop: undefined
  getStatus: undefined
  updateConfig: { settings: LotusMiningSettings }
  shutdown: undefined
}

/**
 * Background -> offscreen document command envelope.
 */
export type OffscreenMinerCommand<
  T extends OffscreenMinerCommandType = OffscreenMinerCommandType,
> = {
  /** Protocol channel discriminator. */
  channel: typeof OFFSCREEN_MINER_CHANNEL
  /** Message kind discriminator. */
  kind: 'command'
  /** Correlation id for request/response matching. */
  requestId: string
  /** Command name. */
  command: T
  /** Command payload matching `command` type. */
  payload: OffscreenMinerCommandPayloadMap[T]
}

/**
 * Offscreen document -> background response envelope.
 */
export type OffscreenMinerResponse<T = unknown> = {
  channel: typeof OFFSCREEN_MINER_CHANNEL
  kind: 'response'
  requestId: string
  ok: boolean
  data?: T
  error?: string
}

/**
 * Offscreen document -> background async event stream.
 */
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

/**
 * Create a normalized default miner status snapshot.
 */
export function createDefaultMinerStatus(): MinerStatus {
  return {
    running: false,
    hashrate: 0,
    testedNonces: '0',
    webgpuAvailable: false,
    webgpuAdapterAvailable: false,
    webgpuDeviceReady: false,
    webgpuPipelineReady: false,
    webgpuSupported: false,
    lastError: '',
    updatedAt: Date.now(),
  }
}

/**
 * Convert persisted UI config shape into mining-service runtime settings.
 */
export function mapConfigToMiningSettings(
  config: MinerConfig,
): LotusMiningSettings {
  const profileKey =
    config.powerProfile === 'low-power' ||
    config.powerProfile === 'balanced' ||
    config.powerProfile === 'high-power'
      ? config.powerProfile
      : 'high-power'
  const profile = config.webgpuProfiles[profileKey]
  return {
    mineToAddress: config.mineToAddress,
    rpc: {
      rpcUrl: config.rpcUrl,
      rpcUser: config.rpcUser,
      rpcPassword: config.rpcPassword,
    },
    gpuPreferences: config.gpuPreferences,
    workgroupSize: profile ? { x: profile.workgroupSizeX } : undefined,
    rpcPollIntervalMs: config.rpcPollIntervalMs,
    iterations: config.iterations,
    kernelSize: config.kernelSize,
    hashrateWindowMs: config.hashrateWindowMs,
  }
}
// ==================================================
// Offscreen Protocol (offscreen <-> worker)
// ==================================================
/** Runtime message channel for offscreen document <-> dedicated worker traffic. */
export const OFFSCREEN_WORKER_CHANNEL =
  'lotusia:offscreen-miner-worker' as const

/** Commands accepted by the offscreen worker runtime. */
export type OffscreenWorkerCommandType =
  | 'ping'
  | 'start'
  | 'stop'
  | 'getStatus'
  | 'shutdown'

/** Per-command payload contract. */
export type OffscreenWorkerCommandPayloadMap = {
  ping: undefined
  start: { settings: LotusMiningSettings }
  stop: undefined
  getStatus: undefined
  shutdown: undefined
}

/** Offscreen document -> worker command envelope. */
export type OffscreenWorkerCommand<T extends OffscreenWorkerCommandType> = {
  channel: typeof OFFSCREEN_WORKER_CHANNEL
  kind: 'command'
  requestId: string
  command: T
  payload: OffscreenWorkerCommandPayloadMap[T]
}

/** Worker -> offscreen document response envelope. */
export type OffscreenWorkerResponse<T = unknown> = {
  channel: typeof OFFSCREEN_WORKER_CHANNEL
  kind: 'response'
  requestId: string
  ok: boolean
  data?: T
  error?: string
}

/** Worker -> offscreen document event stream. */
export type OffscreenWorkerEvent =
  | {
      channel: typeof OFFSCREEN_WORKER_CHANNEL
      kind: 'event'
      event: 'status'
      data: MinerStatus
    }
  | {
      channel: typeof OFFSCREEN_WORKER_CHANNEL
      kind: 'event'
      event: 'error'
      data: { message: string }
    }
