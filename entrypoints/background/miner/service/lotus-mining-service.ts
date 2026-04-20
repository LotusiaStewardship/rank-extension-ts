import { MINER_CONSTANTS } from '@/entrypoints/background/miner/constants'
import {
  createBlock,
  lotusHash,
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
 * - validate candidate via lotus_hash + target compare
 * - submitblock on success
 */
export class LotusMiningService {
  private readonly rpc: LotusRpcClient
  private readonly miner: WebGpuMiner

  private currentWork: MiningWork | null = null
  private nextBlock: LotusBlock | null = null

  private running = false
  private blockPollTimer: ReturnType<typeof setInterval> | null = null
  private mineTimer: ReturnType<typeof setTimeout> | null = null
  private latestError = ''

  private metricsStart = Date.now()
  private testedNonces = 0n

  constructor(private readonly settings: LotusMiningSettings) {
    this.rpc = new LotusRpcClient(settings.rpc)
    this.miner = new WebGpuMiner()
  }

  async start(): Promise<void> {
    if (this.running) return
    this.running = true
    this.latestError = ''

    await this.miner.init({
      iterations: this.settings.iterations ?? MINER_CONSTANTS.DEFAULT_ITERATIONS,
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
      if (!this.running) return
      try {
        await this.mineSomeNonces()
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        this.latestError = msg
        console.error('mineSomeNonces error', err)
      } finally {
        this.mineTimer = globalThis.setTimeout(loop, 0)
      }
    }
    void loop()
  }

  stop(): void {
    this.running = false
    if (this.blockPollTimer !== null) {
      clearInterval(this.blockPollTimer)
      this.blockPollTimer = null
    }
    if (this.mineTimer !== null) {
      clearTimeout(this.mineTimer)
      this.mineTimer = null
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
    const unsolved = await this.rpc.getRawUnsolvedBlock(this.settings.mineToAddress)
    if (!unsolved) {
      return
    }

    const block = createBlock(unsolved)
    const prev = this.currentWork ? this.currentWork.header.slice(0, 32) : null
    if (!prev || bytesToHex(prev) !== bytesToHex(prevHash(block))) {
      console.info('Switched mining tip:', bytesToHex(reverseBytes(prevHash(block))))
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
      this.nextBlock = null
    }

    if (!this.currentWork) {
      return
    }

    const iterations =
      this.settings.iterations ?? MINER_CONSTANTS.DEFAULT_ITERATIONS
    const kernelSize = this.settings.kernelSize ?? MINER_CONSTANTS.DEFAULT_KERNEL_SIZE
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

    const foundNonce = await this.validateCandidateSlots(
      this.currentWork.header,
      this.currentWork.target,
      result.nonceSlots,
    )
    if (foundNonce === null) {
      return
    }

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

  private async buildPartialHeader(header160: Uint8Array): Promise<Uint32Array> {
    const partialHeader = new Uint8Array(84)
    partialHeader.set(header160.slice(0, 52), 0)
    partialHeader.set(
      await crypto.subtle
        .digest('SHA-256', header160.slice(52).buffer.slice(header160.slice(52).byteOffset, header160.slice(52).byteOffset + header160.slice(52).byteLength))
        .then(d => new Uint8Array(d)),
      52,
    )

    const out = new Uint32Array(MINER_CONSTANTS.PARTIAL_HEADER_U32_LENGTH)
    const dv = new DataView(partialHeader.buffer, partialHeader.byteOffset, 84)
    for (let i = 0; i < MINER_CONSTANTS.PARTIAL_HEADER_U32_LENGTH; i++) {
      out[i] = dv.getUint32(i * 4, false)
    }
    return out
  }

  private async validateCandidateSlots(
    header160: Uint8Array,
    targetLe: Uint8Array,
    slots: Uint32Array,
  ): Promise<bigint | null> {
    for (let i = 0; i < 0x7f; i++) {
      const raw = slots[i]!
      if (raw === 0) {
        continue
      }
      const nonce = this.swapU32(raw)
      const candidateHeader = header160.slice()
      const nonceBytes = new Uint8Array(8)
      new DataView(nonceBytes.buffer).setUint32(0, nonce, true)
      candidateHeader.set(nonceBytes.slice(0, 4), 44)

      const hash = await lotusHash(candidateHeader)
      if (hash[31] !== 0) {
        continue
      }

      if (this.hashBelowTarget(hash, targetLe)) {
        const low = BigInt(
          new DataView(
            candidateHeader.buffer,
            candidateHeader.byteOffset + 44,
            4,
          ).getUint32(0, true),
        )
        const high = BigInt(
          new DataView(
            candidateHeader.buffer,
            candidateHeader.byteOffset + 48,
            4,
          ).getUint32(0, true),
        )
        return (high << 32n) | low
      }
    }
    return null
  }

  private hashBelowTarget(hashLe: Uint8Array, targetLe: Uint8Array): boolean {
    for (let i = 31; i >= 0; i--) {
      const h = hashLe[i]!
      const t = targetLe[i]!
      if (h > t) return false
      if (h < t) return true
    }
    return false
  }

  private serializeSolvedBlockHex(solvedHeader: Uint8Array, body: Uint8Array): string {
    const bytes = new Uint8Array(solvedHeader.length + body.length)
    bytes.set(solvedHeader, 0)
    bytes.set(body, solvedHeader.length)
    return bytesToHex(bytes)
  }

  private maybeReportHashrate(): void {
    const windowMs =
      this.settings.hashrateWindowMs ?? MINER_CONSTANTS.DEFAULT_HASHRATE_WINDOW_MS
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
      ((v & 0xff) << 24) |
      ((v & 0xff00) << 8) |
      ((v >>> 8) & 0xff00) |
      ((v >>> 24) & 0xff)
    ) >>> 0
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
