import { MINER_CONSTANTS } from '@/entrypoints/background/miner/constants'
import {
  createBlock,
  prevHash,
  bytesToHex,
  reverseBytes,
} from '@/entrypoints/background/miner/core'
import { WebGpuMiner } from '@/entrypoints/background/miner/gpu/webgpu-miner'
import { LotusRpcClient } from '@/entrypoints/background/miner/network'
import type { LotusBlock } from '@/entrypoints/background/miner/core'
import type { LotusMiningSettings, MiningStats, MiningWork } from './types'

/**
 * End-to-end Lotus miner loop for browser extension runtime.
 * Mirrors lotus-gpu-miner flow:
 * - poll getrawunsolvedblock
 * - run OpenCL-equivalent kernel search
 * - kernel validates candidate against target and returns nonce
 * - submitblock on success
 */
export class LotusMiningService {
  private readonly rpc: LotusRpcClient
  private readonly miner: WebGpuMiner

  private currentWork: MiningWork | null = null
  private nextBlock: LotusBlock | null = null

  private running = false
  private blockPollTimer: ReturnType<typeof setInterval> | null = null
  private latestError = ''

  private metricsStart = Date.now()
  private testedNonces = 0n
  private partialHeaderScratch = new Uint8Array(84)
  private partialHeaderWords = new Uint32Array(
    MINER_CONSTANTS.PARTIAL_HEADER_U32_LENGTH,
  )

  constructor(private readonly settings: LotusMiningSettings) {
    this.rpc = new LotusRpcClient(settings.rpc)
    this.miner = new WebGpuMiner()
  }

  async start(): Promise<void> {
    if (this.running) return
    this.running = true
    this.latestError = ''
    this.testedNonces = 0n
    this.metricsStart = Date.now()

    try {
      await this.miner.init({
        iterations:
          this.settings.iterations ?? MINER_CONSTANTS.DEFAULT_ITERATIONS,
        workgroupSize: MINER_CONSTANTS.DEFAULT_WORKGROUP_SIZE,
      })

      await this.updateNextBlock()

      const pollMs =
        this.settings.rpcPollIntervalMs ?? MINER_CONSTANTS.DEFAULT_RPC_POLL_MS
      this.blockPollTimer = globalThis.setInterval(() => {
        void this.updateNextBlock().catch(err =>
          console.error('updateNextBlock error', err),
        )
      }, pollMs)

      const loop = async () => {
        while (this.running) {
          try {
            await this.mineSomeNonces()
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            this.latestError = msg
            console.error('mineSomeNonces error', err)
          }
        }
      }
      void loop()
    } catch (err) {
      this.running = false
      this.miner.destroy()
      const msg = err instanceof Error ? err.message : String(err)
      this.latestError = msg
      throw err
    }
  }

  stop(): void {
    this.running = false
    if (this.blockPollTimer !== null) {
      clearInterval(this.blockPollTimer)
      this.blockPollTimer = null
    }
    this.miner.destroy()
  }

  getStats(): MiningStats {
    const elapsedSec = Math.max(0.001, (Date.now() - this.metricsStart) / 1000)
    return {
      hashrate: Number(this.testedNonces) / elapsedSec,
      testedNonces: this.testedNonces,
    }
  }

  get isRunning(): boolean {
    return this.running
  }

  get lastError(): string {
    return this.latestError
  }

  private async updateNextBlock(): Promise<void> {
    const unsolved = await this.rpc.getRawUnsolvedBlock(
      this.settings.mineToAddress,
    )
    if (!unsolved) {
      return
    }

    const block = createBlock(unsolved)
    const prev = this.currentWork?.header.subarray(0, 32) ?? null
    const nextPrev = prevHash(block)
    if (!prev || !this.equal32(prev, nextPrev)) {
      console.info(
        'Switched mining tip:',
        bytesToHex(reverseBytes(nextPrev)),
      )
    }
    this.nextBlock = block
  }

  private async mineSomeNonces(): Promise<void> {
    if (this.nextBlock) {
      this.currentWork = {
        header: this.nextBlock.header,
        body: this.nextBlock.body,
        target: this.nextBlock.target,
        nonceIdx: 0,
      }
      this.miner.setTarget(this.currentWork.target)
      this.nextBlock = null
    }

    if (!this.currentWork) {
      return
    }

    const iterations =
      this.settings.iterations ?? MINER_CONSTANTS.DEFAULT_ITERATIONS
    const kernelSize =
      this.settings.kernelSize ?? MINER_CONSTANTS.DEFAULT_KERNEL_SIZE
    const numNoncesPerSearch = BigInt(kernelSize) * BigInt(iterations)

    const baseBig = BigInt(this.currentWork.nonceIdx) * numNoncesPerSearch
    if (baseBig > BigInt(0xffffffff)) {
      console.warn('Nonce base overflow range reached; waiting for new work')
      return
    }
    const base = Number(baseBig)

    const bigNonce = this.randomU64()
    this.setBigNonce(this.currentWork.header, bigNonce)

    const partialHeader = await this.buildPartialHeader(this.currentWork.header)
    this.miner.setPartialHeader(partialHeader)

    const result = await this.miner.run({
      offset: base,
      nonceCount: Number(numNoncesPerSearch),
    })

    this.currentWork.nonceIdx += 1
    this.testedNonces += numNoncesPerSearch
    this.maybeReportHashrate()

    if (!result.found) {
      return
    }

    const nonceLow = this.swapU32(result.nonceLow)
    if (nonceLow === 0) {
      return
    }
    const foundNonce =
      ((bigNonce >> 32n) << 32n) | BigInt(nonceLow >>> 0)

    this.setBigNonce(this.currentWork.header, foundNonce)
    console.info('Block hash below target with nonce:', foundNonce.toString())

    const solvedBlockHex = this.serializeSolvedBlockHex(
      this.currentWork.header,
      this.currentWork.body,
    )
    const submitResult = await this.rpc.submitBlock(solvedBlockHex)
    if (submitResult === null) {
      console.info('BLOCK ACCEPTED!')
    } else {
      console.error('REJECTED BLOCK:', submitResult)
    }
  }

  private async buildPartialHeader(
    header160: Uint8Array,
  ): Promise<Uint32Array> {
    const partialHeader = this.partialHeaderScratch
    partialHeader.set(header160.subarray(0, 52), 0)

    const txLayerView = header160.subarray(52)
    const txLayerHash = await crypto.subtle.digest(
      'SHA-256',
      txLayerView as BufferSource,
    )
    partialHeader.set(new Uint8Array(txLayerHash), 52)

    const out = this.partialHeaderWords
    const dv = new DataView(partialHeader.buffer, partialHeader.byteOffset, 84)
    for (let i = 0; i < MINER_CONSTANTS.PARTIAL_HEADER_U32_LENGTH; i++) {
      out[i] = dv.getUint32(i * 4, false)
    }
    return out
  }

  private equal32(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length < 32 || b.length < 32) {
      return false
    }
    for (let i = 0; i < 32; i++) {
      if (a[i] !== b[i]) {
        return false
      }
    }
    return true
  }

  private serializeSolvedBlockHex(
    solvedHeader: Uint8Array,
    body: Uint8Array,
  ): string {
    const bytes = new Uint8Array(solvedHeader.length + body.length)
    bytes.set(solvedHeader, 0)
    bytes.set(body, solvedHeader.length)
    return bytesToHex(bytes)
  }

  private maybeReportHashrate(): void {
    const windowMs =
      this.settings.hashrateWindowMs ??
      MINER_CONSTANTS.DEFAULT_HASHRATE_WINDOW_MS
    const elapsed = Date.now() - this.metricsStart
    if (elapsed < windowMs) return

    const hashrate = Number(this.testedNonces) / (elapsed / 1000)
    console.info(`Hashrate ${(hashrate / 1_000_000).toFixed(3)} MH/s`)
    this.testedNonces = 0n
    this.metricsStart = Date.now()
  }

  private setBigNonce(header160: Uint8Array, nonce: bigint): void {
    const low = Number(nonce & 0xffffffffn)
    const high = Number((nonce >> 32n) & 0xffffffffn)
    const dv = new DataView(
      header160.buffer,
      header160.byteOffset,
      header160.byteLength,
    )
    dv.setUint32(44, low >>> 0, true)
    dv.setUint32(48, high >>> 0, true)
  }

  private swapU32(v: number): number {
    return (
      (((v & 0xff) << 24) |
        ((v & 0xff00) << 8) |
        ((v >>> 8) & 0xff00) |
        ((v >>> 24) & 0xff)) >>>
      0
    )
  }

  private randomU64(): bigint {
    const bytes = new Uint8Array(8)
    crypto.getRandomValues(bytes)
    const dv = new DataView(bytes.buffer)
    const low = BigInt(dv.getUint32(0, true))
    const high = BigInt(dv.getUint32(4, true))
    return (high << 32n) | low
  }
}
