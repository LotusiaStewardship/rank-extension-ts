import type { MinerStatus } from '../background/stores'
/** Active dedicated worker running the mining service implementation. */
let worker: Worker | null = null
/** Latest status snapshot cached for immediate responses and rebroadcasts. */
let latestStatus: MinerStatus = createDefaultMinerStatus()
/** Persisted JSON settings used to rehydrate worker state on recreation. */
let currentSettingsJson = ''

/**
 * Entry command listener for background -> offscreen document messages.
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const maybeCommand = asOffscreenMinerCommand(message)
  if (!maybeCommand) {
    return undefined
  }

  void handleBackgroundCommand(maybeCommand)
    .then(response => {
      sendResponse(response)
    })
    .catch(error => {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      sendResponse(
        buildResponse(maybeCommand.requestId, false, undefined, errorMessage),
      )
    })

  return true
})

// Inform background that offscreen control plane is ready.
void sendEventToBackground({
  channel: OFFSCREEN_MINER_CHANNEL,
  kind: 'event',
  event: 'ready',
})

/**
 * Execute one control-plane command from background runtime.
 */
async function handleBackgroundCommand(
  command: OffscreenMinerCommand<OffscreenMinerCommandType>,
): Promise<OffscreenMinerResponse<unknown> | undefined> {
  try {
    switch (command.command) {
      case 'ping': {
        return buildResponse(command.requestId, true, latestStatus)
      }

      case 'getStatus': {
        latestStatus = await queryWorkerStatus()
        return buildResponse(command.requestId, true, latestStatus)
      }

      case 'start': {
        const payload = command.payload
        if (!payload) {
          return buildResponse(
            command.requestId,
            false,
            undefined,
            'Missing start payload',
          )
        }
        const settings = payload.settings
        currentSettingsJson = JSON.stringify(settings)
        await sendWorkerCommand('start', { settings })
        latestStatus = await queryWorkerStatus()
        await emitStatus(latestStatus)
        return buildResponse(command.requestId, true, latestStatus)
      }

      case 'updateConfig': {
        const payload = command.payload
        if (!payload) {
          return buildResponse(
            command.requestId,
            false,
            undefined,
            'Missing updateConfig payload',
          )
        }
        const settings = payload.settings
        currentSettingsJson = JSON.stringify(settings)
        if (latestStatus.running) {
          await sendWorkerCommand('start', { settings })
        }
        latestStatus = await queryWorkerStatus()
        await emitStatus(latestStatus)
        return buildResponse(command.requestId, true, latestStatus)
      }

      case 'stop': {
        if (worker) {
          await sendWorkerCommand('stop', undefined)
        }
        latestStatus = await queryWorkerStatus()
        await emitStatus(latestStatus)
        return buildResponse(command.requestId, true, latestStatus)
      }

      case 'shutdown': {
        if (worker) {
          await sendWorkerCommand('shutdown', undefined)
          worker.terminate()
          worker = null
        }
        latestStatus = createDefaultMinerStatus()
        await emitStatus(latestStatus)
        return buildResponse(command.requestId, true, latestStatus)
      }

      default:
        return buildResponse(
          command.requestId,
          false,
          undefined,
          'Unknown offscreen command',
        )
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    latestStatus = {
      ...latestStatus,
      running: false,
      lastError: errorMessage,
      updatedAt: Date.now(),
    }
    await emitStatus(latestStatus)
    await sendEventToBackground({
      channel: OFFSCREEN_MINER_CHANNEL,
      kind: 'event',
      event: 'error',
      data: { message: errorMessage },
    })
    return buildResponse(command.requestId, false, undefined, errorMessage)
  }
}

/**
 * Runtime guard and type narrowing for background command payloads.
 */
function asOffscreenMinerCommand(
  message: unknown,
): OffscreenMinerCommand<OffscreenMinerCommandType> | null {
  if (!message || typeof message !== 'object') {
    return null
  }

  const command = message as Partial<
    OffscreenMinerCommand<OffscreenMinerCommandType>
  >
  if (
    command.channel !== OFFSCREEN_MINER_CHANNEL ||
    command.kind !== 'command' ||
    typeof command.requestId !== 'string' ||
    typeof command.command !== 'string'
  ) {
    return null
  }

  return command as OffscreenMinerCommand<OffscreenMinerCommandType>
}

/**
 * Lazily create or return the dedicated mining worker.
 */
function ensureWorker(): Worker {
  if (worker) {
    return worker
  }

  const workerUrl = chrome.runtime.getURL('/offscreen-miner-worker.js')
  worker = new Worker(workerUrl, { type: 'module' })

  worker.addEventListener('message', event => {
    void handleWorkerEvent(event.data as unknown)
  })

  worker.addEventListener('error', event => {
    const message = event.message || 'Offscreen miner worker error'
    void handleWorkerError(message)
  })

  worker.addEventListener('messageerror', () => {
    void handleWorkerError(
      'Offscreen miner worker message deserialization failed',
    )
  })

  // Re-apply latest settings if worker was recreated.
  if (currentSettingsJson) {
    const settings = JSON.parse(
      currentSettingsJson,
    ) as OffscreenMinerCommand<'start'>['payload']['settings']
    void sendWorkerCommand('start', { settings }).catch(err => {
      void handleWorkerError(err instanceof Error ? err.message : String(err))
    })
  }

  return worker
}

/**
 * Send one request/response command to the dedicated worker.
 */
async function sendWorkerCommand<T extends OffscreenWorkerCommandType>(
  command: T,
  payload: OffscreenWorkerCommand<T>['payload'],
): Promise<OffscreenWorkerResponse<unknown>> {
  const activeWorker = ensureWorker()

  const request: OffscreenWorkerCommand<T> = {
    channel: OFFSCREEN_WORKER_CHANNEL,
    kind: 'command',
    requestId: newRequestId(),
    command,
    payload,
  }

  return await new Promise<OffscreenWorkerResponse<unknown>>(
    (resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup()
        reject(new Error(`Offscreen worker command timeout: ${command}`))
      }, 10_000)

      const onMessage = (event: MessageEvent<unknown>) => {
        const data = event.data as OffscreenWorkerResponse<unknown>
        if (
          !data ||
          typeof data !== 'object' ||
          data.channel !== OFFSCREEN_WORKER_CHANNEL ||
          data.kind !== 'response' ||
          data.requestId !== request.requestId
        ) {
          return
        }

        cleanup()
        if (!data.ok) {
          reject(new Error(data.error ?? `Worker command failed: ${command}`))
          return
        }
        resolve(data)
      }

      const onError = (event: ErrorEvent) => {
        cleanup()
        reject(new Error(event.message || 'Worker error during command'))
      }

      const cleanup = () => {
        clearTimeout(timeout)
        activeWorker.removeEventListener('message', onMessage)
        activeWorker.removeEventListener('error', onError)
      }

      activeWorker.addEventListener('message', onMessage)
      activeWorker.addEventListener('error', onError)
      activeWorker.postMessage(request)
    },
  )
}

/**
 * Query and normalize worker status.
 */
async function queryWorkerStatus(): Promise<MinerStatus> {
  if (!worker) {
    return {
      ...createDefaultMinerStatus(),
      webgpuSupported: 'gpu' in navigator,
      updatedAt: Date.now(),
    }
  }

  const response = await sendWorkerCommand('getStatus', undefined)
  const status = response.data as MinerStatus | undefined
  if (!status) {
    return {
      ...createDefaultMinerStatus(),
      webgpuSupported: 'gpu' in navigator,
      updatedAt: Date.now(),
    }
  }
  return {
    running: Boolean(status.running),
    hashrate: Number(status.hashrate ?? 0),
    testedNonces: String(status.testedNonces ?? '0'),
    webgpuSupported: Boolean(status.webgpuSupported),
    lastError: String(status.lastError ?? ''),
    updatedAt: Number(status.updatedAt ?? Date.now()),
  }
}

/**
 * Handle asynchronous worker events and forward status/error upstream.
 */
async function handleWorkerEvent(message: unknown): Promise<void> {
  if (!message || typeof message !== 'object') {
    return
  }

  const event = message as OffscreenWorkerEvent
  if (event.channel !== OFFSCREEN_WORKER_CHANNEL || event.kind !== 'event') {
    return
  }

  if (event.event === 'status') {
    latestStatus = {
      running: Boolean(event.data.running),
      hashrate: Number(event.data.hashrate ?? 0),
      testedNonces: String(event.data.testedNonces ?? '0'),
      webgpuSupported: Boolean(event.data.webgpuSupported),
      lastError: String(event.data.lastError ?? ''),
      updatedAt: Number(event.data.updatedAt ?? Date.now()),
    }
    await emitStatus(latestStatus)
    return
  }

  if (event.event === 'error') {
    await handleWorkerError(event.data.message)
  }
}

/**
 * Centralized worker error handling and propagation to background runtime.
 */
async function handleWorkerError(message: string): Promise<void> {
  latestStatus = {
    ...latestStatus,
    running: false,
    lastError: message,
    updatedAt: Date.now(),
  }
  await emitStatus(latestStatus)
  await sendEventToBackground({
    channel: OFFSCREEN_MINER_CHANNEL,
    kind: 'event',
    event: 'error',
    data: { message },
  })
}

/**
 * Build a protocol response envelope for background command replies.
 */
function buildResponse(
  requestId: string,
  ok: boolean,
  data?: unknown,
  error?: string,
): OffscreenMinerResponse<unknown> {
  return {
    channel: OFFSCREEN_MINER_CHANNEL,
    kind: 'response',
    requestId,
    ok,
    data,
    error,
  }
}

/** Emit a status event to background listeners. */
async function emitStatus(status: MinerStatus): Promise<void> {
  await sendEventToBackground({
    channel: OFFSCREEN_MINER_CHANNEL,
    kind: 'event',
    event: 'status',
    data: status,
  })
}

/** Send one offscreen protocol event to background runtime. */
async function sendEventToBackground(
  event: OffscreenMinerEvent,
): Promise<void> {
  await browser.runtime.sendMessage(event)
}

/** Create a lightweight unique request id for worker commands. */
function newRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}
