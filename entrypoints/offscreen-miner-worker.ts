/// <reference lib="webworker" />
import { LotusMiningService } from './offscreen-miner/service'
import type { MinerStatus } from './background/stores'

/** Active mining service instance for this worker runtime. */
let miningService: LotusMiningService | null = null
/** Last received start settings. */
let currentSettings: LotusMiningSettings | null = null
/** Periodic status emission timer. */
let statusTimer: ReturnType<typeof setInterval> | null = null
/** Last known staged WebGPU diagnostics snapshot (survives runtime stop). */
let lastWebGpuDiagnostics: WebGpuDiagnostics = defaultWebGpuDiagnostics()

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
  if (
    command.channel !== OFFSCREEN_WORKER_CHANNEL ||
    command.kind !== 'command'
  ) {
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
        return respond(
          command.requestId,
          false,
          undefined,
          'Unknown worker command',
        )
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
  try {
    await miningService.start()
    lastWebGpuDiagnostics = miningService.webGpuDiagnostics
    startStatusLoop()
  } catch (error) {
    lastWebGpuDiagnostics = miningService.webGpuDiagnostics
    throw error
  }
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
  lastWebGpuDiagnostics = miningService.webGpuDiagnostics
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
  const diagnostics = miningService?.webGpuDiagnostics ?? lastWebGpuDiagnostics
  const lastError = miningService?.lastError || diagnostics.lastError || ''

  return {
    running,
    hashrate: stats?.hashrate ?? 0,
    testedNonces: (stats?.testedNonces ?? 0n).toString(),
    webgpuAvailable: diagnostics.apiAvailable,
    webgpuAdapterAvailable: diagnostics.adapterAvailable,
    webgpuDeviceReady: diagnostics.deviceReady,
    webgpuPipelineReady: diagnostics.pipelineReady,
    webgpuSupported: diagnostics.pipelineReady,
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

function defaultWebGpuDiagnostics(): WebGpuDiagnostics {
  return {
    apiAvailable: 'gpu' in navigator && Boolean(navigator.gpu),
    adapterAvailable: false,
    deviceReady: false,
    pipelineReady: false,
    lastError: '',
  }
}
