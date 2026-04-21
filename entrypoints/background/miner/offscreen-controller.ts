import type { MinerStatus } from '@/entrypoints/background/stores'
import {
  OFFSCREEN_MINER_CHANNEL,
  createDefaultMinerStatus,
  type OffscreenMinerCommand,
  type OffscreenMinerCommandType,
  type OffscreenMinerEvent,
  type OffscreenMinerResponse,
} from '@/entrypoints/background/miner/offscreen-protocol'

type ControllerOptions = {
  offscreenPath?: string
  onStatus?: (status: MinerStatus) => Promise<void> | void
}

export class OffscreenMinerController {
  private readonly offscreenPath: string
  private creating: Promise<void> | null = null
  private readonly onStatus?: (status: MinerStatus) => Promise<void> | void

  constructor(options: ControllerOptions = {}) {
    this.offscreenPath = options.offscreenPath ?? 'offscreen-miner.html'
    this.onStatus = options.onStatus

    browser.runtime.onMessage.addListener((message: unknown) => {
      void this.handleEventMessage(message)
      return undefined
    })
  }

  async start(settings: OffscreenMinerCommand<'start'>['payload']['settings']): Promise<MinerStatus> {
    const response = await this.sendCommand('start', { settings })
    return this.requireStatus(response)
  }

  async stop(): Promise<MinerStatus> {
    const response = await this.sendCommand('stop', undefined)
    return this.requireStatus(response)
  }

  async getStatus(): Promise<MinerStatus> {
    const response = await this.sendCommand('getStatus', undefined)
    return this.requireStatus(response)
  }

  async updateConfig(
    settings: OffscreenMinerCommand<'updateConfig'>['payload']['settings'],
  ): Promise<MinerStatus> {
    const response = await this.sendCommand('updateConfig', { settings })
    return this.requireStatus(response)
  }

  async ping(): Promise<boolean> {
    try {
      const response = await this.sendCommand('ping', undefined)
      return response.ok
    } catch {
      return false
    }
  }

  async shutdown(): Promise<void> {
    try {
      await this.sendCommand('shutdown', undefined)
    } catch {
      // ignored: we are shutting down best-effort
    }

    if (await this.hasOffscreenDocument()) {
      await chrome.offscreen.closeDocument()
    }
  }

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

    const response = (await browser.runtime.sendMessage(
      request,
    )) as OffscreenMinerResponse<unknown> | undefined

    if (!response || response.channel !== OFFSCREEN_MINER_CHANNEL) {
      throw new Error('No valid response from offscreen miner runtime')
    }

    if (!response.ok) {
      throw new Error(response.error ?? `Offscreen miner command failed: ${command}`)
    }

    return response
  }

  private requireStatus(response: OffscreenMinerResponse<unknown>): MinerStatus {
    const data = response.data
    if (!data || typeof data !== 'object') {
      return createDefaultMinerStatus()
    }
    const status = data as MinerStatus
    return {
      running: Boolean(status.running),
      hashrate: Number(status.hashrate ?? 0),
      testedNonces: String(status.testedNonces ?? '0'),
      webgpuSupported: Boolean(status.webgpuSupported),
      lastError: String(status.lastError ?? ''),
      updatedAt: Number(status.updatedAt ?? Date.now()),
    }
  }

  private async ensureOffscreenDocument(): Promise<void> {
    if (await this.hasOffscreenDocument()) {
      return
    }

    if (this.creating) {
      await this.creating
      return
    }

    this.creating = chrome.offscreen.createDocument({
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

  private async hasOffscreenDocument(): Promise<boolean> {
    const offscreenUrl = chrome.runtime.getURL(this.offscreenPath)
    const runtimeWithContexts = chrome.runtime as typeof chrome.runtime & {
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

  private async handleEventMessage(message: unknown): Promise<void> {
    if (!message || typeof message !== 'object') {
      return
    }

    const eventMessage = message as OffscreenMinerEvent
    if (
      eventMessage.channel !== OFFSCREEN_MINER_CHANNEL
      || eventMessage.kind !== 'event'
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

  private newRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`
  }
}
