import type { LotusMiningSettings } from '@/entrypoints/background/miner/service'
import type { MinerStatus } from '@/entrypoints/background/stores/miner'

/** Runtime message channel for offscreen document <-> dedicated worker traffic. */
export const OFFSCREEN_WORKER_CHANNEL = 'lotusia:offscreen-miner-worker' as const

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
export type OffscreenWorkerCommand<T extends OffscreenWorkerCommandType = OffscreenWorkerCommandType> = {
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
