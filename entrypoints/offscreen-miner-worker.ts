/// <reference lib="webworker" />

import {
  OFFSCREEN_WORKER_CHANNEL,
  type OffscreenWorkerCommand,
  type OffscreenWorkerCommandType,
  type OffscreenWorkerEvent,
  type OffscreenWorkerResponse,
} from '@/entrypoints/background/miner/offscreen-worker-protocol'
import {
  LotusMiningService,
  type LotusMiningSettings,
} from '@/entrypoints/background/miner/service'
import type { MinerStatus } from '@/entrypoints/background/stores/miner'

/** Active mining service instance for this worker runtime. */
let miningService: LotusMiningService | null = null
/** Last received start settings. */
let currentSettings: LotusMiningSettings | null = null
/** Periodic status emission timer. */
let statusTimer: ReturnType<typeof setInterval> | null = null

/**
 * Offscreen miner worker script entrypoint.
 */
export default defineUnlistedScript({
  main() {
    self.addEventListener('message', event => {
      void handleCommand(event.data as unknown)
    })
  },
})

/**
 * Parse, execute, and respond to one worker protocol command.
 */
async function handleCommand(message: unknown): Promise<void> {
  if (!message || typeof message !== 'object') return

  const command = message as OffscreenWorkerCommand<OffscreenWorkerCommandType>
  if (command.channel !== OFFSCREEN_WORKER_CHANNEL || command.kind !== 'command') {
    return
  }

  try {
    switch (command.command) {
      case 'ping': {
        return respond(command.requestId, true, await buildStatus())
      }

      case 'getStatus': {
        return respond(command.requestId, true, await buildStatus())
      }

      case 'start': {
        const payload = command.payload
        if (!payload) {
          throw new Error('Missing start payload')
        }
        await startWithSettings(payload.settings)
        return respond(command.requestId, true, await buildStatus())
      }

      case 'stop': {
        await stopRuntime()
        return respond(command.requestId, true, await buildStatus())
      }

      case 'shutdown': {
        await stopRuntime()
        respond(command.requestId, true, await buildStatus())
        return
      }

      default:
        return respond(command.requestId, false, undefined, 'Unknown worker command')
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    emitEvent({
      channel: OFFSCREEN_WORKER_CHANNEL,
      kind: 'event',
      event: 'error',
      data: { message },
    })
    respond(command.requestId, false, undefined, message)
  }
}

/**
 * Recreate runtime with fresh settings and start mining.
 */
async function startWithSettings(settings: LotusMiningSettings): Promise<void> {
  currentSettings = settings
  await stopRuntime()
  miningService = new LotusMiningService(settings)
  await miningService.start()
  startStatusLoop()
}

/**
 * Stop mining service and clear recurring status emissions.
 */
async function stopRuntime(): Promise<void> {
  if (statusTimer) {
    clearInterval(statusTimer)
    statusTimer = null
  }
  if (!miningService) {
    return
  }
  miningService.stop()
  miningService = null
}

/**
 * Emit periodic status updates to the offscreen document.
 */
function startStatusLoop(): void {
  if (statusTimer) {
    clearInterval(statusTimer)
  }
  statusTimer = setInterval(() => {
    void buildStatus().then(status => {
      emitEvent({
        channel: OFFSCREEN_WORKER_CHANNEL,
        kind: 'event',
        event: 'status',
        data: status,
      })
    })
  }, 1000)
}

/**
 * Build normalized status from active mining service.
 */
async function buildStatus(): Promise<MinerStatus> {
  const stats = miningService?.getStats()
  const running = Boolean(miningService?.isRunning)
  const lastError = miningService?.lastError ?? ''
  return {
    running,
    hashrate: stats?.hashrate ?? 0,
    testedNonces: (stats?.testedNonces ?? 0n).toString(),
    webgpuSupported: 'gpu' in navigator,
    lastError,
    updatedAt: Date.now(),
  }
}

/**
 * Send a response envelope to the offscreen document.
 */
function respond(
  requestId: string,
  ok: boolean,
  data?: unknown,
  error?: string,
): void {
  const response: OffscreenWorkerResponse<unknown> = {
    channel: OFFSCREEN_WORKER_CHANNEL,
    kind: 'response',
    requestId,
    ok,
    data,
    error,
  }
  self.postMessage(response)
}

/**
 * Emit async worker events (status/error).
 */
function emitEvent(event: OffscreenWorkerEvent): void {
  self.postMessage(event)
}
