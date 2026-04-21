import type { LotusMiningSettings } from '@/entrypoints/background/miner/service'
import type { MinerStatus } from '@/entrypoints/background/stores/miner'

export const OFFSCREEN_WORKER_CHANNEL = 'lotusia:offscreen-miner-worker' as const

export type OffscreenWorkerCommandType =
  | 'ping'
  | 'start'
  | 'stop'
  | 'getStatus'
  | 'shutdown'

export type OffscreenWorkerCommandPayloadMap = {
  ping: undefined
  start: { settings: LotusMiningSettings }
  stop: undefined
  getStatus: undefined
  shutdown: undefined
}

export type OffscreenWorkerCommand<T extends OffscreenWorkerCommandType = OffscreenWorkerCommandType> = {
  channel: typeof OFFSCREEN_WORKER_CHANNEL
  kind: 'command'
  requestId: string
  command: T
  payload: OffscreenWorkerCommandPayloadMap[T]
}

export type OffscreenWorkerResponse<T = unknown> = {
  channel: typeof OFFSCREEN_WORKER_CHANNEL
  kind: 'response'
  requestId: string
  ok: boolean
  data?: T
  error?: string
}

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
