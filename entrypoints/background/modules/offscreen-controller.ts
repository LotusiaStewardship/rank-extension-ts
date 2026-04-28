import type { PublicPath } from 'wxt/browser'
import type { MinerStatus } from '../stores'

/**
 * Construction options for {@link OffscreenMinerController}.
 */
type ControllerOptions = {
  /** Relative offscreen document URL in extension bundle. */
  offscreenPath?: string
  /** Optional status callback for async status/event updates. */
  onStatus?: (status: MinerStatus) => Promise<void> | void
}

/**
 * Background service-worker facade for controlling the offscreen miner runtime.
 *
 * This class owns command/response messaging, ensures offscreen document
 * creation, and normalizes status payloads received from events/responses.
 */
export class OffscreenMinerController {
  /** Offscreen HTML path loaded with `browser.offscreen.createDocument`. */
  private readonly offscreenPath: string
  /** In-flight createDocument promise used to avoid duplicate creation races. */
  private creating: Promise<void> | null = null
  /** Optional external status sink for propagated status updates. */
  private readonly onStatus?: (status: MinerStatus) => Promise<void> | void

  constructor(options: ControllerOptions = {}) {
    this.offscreenPath = options.offscreenPath ?? '/offscreen-miner.html'
    this.onStatus = options.onStatus

    browser.runtime.onMessage.addListener((message: unknown) => {
      void this.handleEventMessage(message)
      return undefined
    })
  }

  /** Start mining in offscreen runtime using provided settings. */
  async start(
    settings: OffscreenMinerCommand<'start'>['payload']['settings'],
  ): Promise<MinerStatus> {
    const response = await this.sendCommand('start', { settings })
    return this.requireStatus(response)
  }

  /** Stop mining if offscreen runtime exists. */
  async stop(): Promise<MinerStatus> {
    if (!(await this.hasOffscreenDocument())) {
      return this.defaultStatus()
    }
    const response = await this.sendCommand('stop', undefined)
    return this.requireStatus(response)
  }

  /** Query latest miner status from offscreen runtime. */
  async getStatus(): Promise<MinerStatus> {
    if (!(await this.hasOffscreenDocument())) {
      return this.defaultStatus()
    }
    const response = await this.sendCommand('getStatus', undefined)
    return this.requireStatus(response)
  }

  /** Update runtime settings; may trigger restart in offscreen layer. */
  async updateConfig(
    settings: OffscreenMinerCommand<'updateConfig'>['payload']['settings'],
  ): Promise<MinerStatus> {
    const response = await this.sendCommand('updateConfig', { settings })
    return this.requireStatus(response)
  }

  /** Health-check command to verify offscreen runtime reachability. */
  async ping(): Promise<boolean> {
    try {
      const response = await this.sendCommand('ping', undefined)
      return response.ok
    } catch {
      return false
    }
  }

  /**
   * Best-effort shutdown of offscreen miner and document context.
   */
  async shutdown(): Promise<void> {
    const hasDocument = await this.hasOffscreenDocument()
    if (!hasDocument) {
      return
    }

    try {
      await this.sendCommand('shutdown', undefined)
    } catch {
      // ignored: we are shutting down best-effort
    }

    if (await this.hasOffscreenDocument()) {
      await browser.offscreen.closeDocument()
    }
  }

  /**
   * Send one protocol command and require a successful response.
   */
  private async sendCommand<T extends OffscreenMinerCommandType>(
    command: T,
    payload: OffscreenMinerCommand<T>['payload'],
  ): Promise<OffscreenMinerResponse<unknown>> {
    await this.ensureOffscreenDocument()

    const request: OffscreenMinerCommand<T> = {
      channel: OFFSCREEN_MINER_CHANNEL,
      kind: 'command',
      requestId: this.newRequestId(),
      command,
      payload,
    }

    const response = (await browser.runtime.sendMessage(request)) as
      | OffscreenMinerResponse<unknown>
      | undefined

    if (!response || response.channel !== OFFSCREEN_MINER_CHANNEL) {
      throw new Error('No valid response from offscreen miner runtime')
    }

    if (!response.ok) {
      throw new Error(
        response.error ?? `Offscreen miner command failed: ${command}`,
      )
    }

    return response
  }

  /**
   * Sanitize and normalize a status payload.
   */
  private requireStatus(
    response: OffscreenMinerResponse<unknown>,
  ): MinerStatus {
    const data = response.data
    if (!data || typeof data !== 'object') {
      return this.defaultStatus()
    }
    const status = data as MinerStatus
    return {
      running: Boolean(status.running),
      hashrate: Number(status.hashrate ?? 0),
      testedNonces: String(status.testedNonces ?? '0'),
      webgpuAvailable: Boolean(status.webgpuAvailable),
      webgpuAdapterAvailable: Boolean(status.webgpuAdapterAvailable),
      webgpuDeviceReady: Boolean(status.webgpuDeviceReady),
      webgpuPipelineReady: Boolean(status.webgpuPipelineReady),
      webgpuSupported: Boolean(status.webgpuSupported),
      lastError: String(status.lastError ?? ''),
      updatedAt: Number(status.updatedAt ?? Date.now()),
    }
  }

  /**
   * Build default status fallback for cases with no active offscreen runtime.
   */
  private defaultStatus(): MinerStatus {
    return {
      ...createDefaultMinerStatus(),
      webgpuAvailable: 'gpu' in navigator && Boolean(navigator.gpu),
      updatedAt: Date.now(),
    }
  }

  /**
   * Ensure offscreen document exists before sending commands.
   */
  private async ensureOffscreenDocument(): Promise<void> {
    if (await this.hasOffscreenDocument()) {
      return
    }

    if (this.creating) {
      await this.creating
      return
    }

    this.creating = browser.offscreen.createDocument({
      url: this.offscreenPath,
      reasons: ['WORKERS'],
      justification: 'Run WebGPU miner in isolated offscreen runtime',
    })

    try {
      await this.creating
    } finally {
      this.creating = null
    }
  }

  /**
   * Detect whether the target offscreen document is currently alive.
   */
  private async hasOffscreenDocument(): Promise<boolean> {
    const offscreenUrl = browser.runtime.getURL(
      this.offscreenPath as PublicPath,
    )
    const runtimeWithContexts = browser.runtime as typeof browser.runtime & {
      getContexts?: (filter: {
        contextTypes: string[]
        documentUrls: string[]
      }) => Promise<Array<unknown>>
    }

    if (!runtimeWithContexts.getContexts) {
      return false
    }

    const contexts = await runtimeWithContexts.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [offscreenUrl],
    })

    return contexts.length > 0
  }

  /**
   * Handle async event messages emitted by offscreen runtime.
   */
  private async handleEventMessage(message: unknown): Promise<void> {
    if (!message || typeof message !== 'object') {
      return
    }

    const eventMessage = message as OffscreenMinerEvent
    if (
      eventMessage.channel !== OFFSCREEN_MINER_CHANNEL ||
      eventMessage.kind !== 'event'
    ) {
      return
    }

    if (eventMessage.event === 'status' && this.onStatus) {
      await this.onStatus(eventMessage.data)
      return
    }

    if (eventMessage.event === 'error' && this.onStatus) {
      await this.onStatus({
        ...createDefaultMinerStatus(),
        lastError: eventMessage.data.message,
        updatedAt: Date.now(),
      })
    }
  }

  /** Generate a lightweight correlation id for command messages. */
  private newRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`
  }
}
