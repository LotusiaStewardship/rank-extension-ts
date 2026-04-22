import { WebGpuMiner } from './webgpu-miner'
import { LotusRpcClient } from './rpc'

/**
 * End-to-end Lotus mining coordinator for extension worker runtimes.
 *
 * Responsibilities:
 * - Poll node RPC for fresh `getrawunsolvedblock` templates.
 * - Prepare and upload partial header + target to GPU runtime.
 * - Dispatch kernel searches over nonce windows.
 * - Validate candidates on CPU and submit solved blocks.
 * - Track miner metrics and last known error state.
 */
export class LotusMiningService {
  /** JSON-RPC client for template fetch and submission. */
  private readonly rpc: LotusRpcClient
  /** Low-level WebGPU miner execution engine. */
  private readonly miner: WebGpuMiner

  /** Actively mined template, if any. */
  private currentWork: MiningWork | null = null
  /** Most recently fetched template waiting to become current work. */
  private nextBlock: LotusBlock | null = null
  /** Current chain tip (prev-hash) used to detect template switches. */
  private currentTip: Uint8Array | null = null

  /** Miner lifecycle flag toggled by `start`/`stop`. */
  private running = false
  /** Background polling timer for block template refresh. */
  private blockPollTimer: ReturnType<typeof setInterval> | null = null
  /** Last error message observed in the mining loop. */
  private latestError = ''

  /** Timestamp used for hashrate window calculations. */
  private metricsStart = Date.now()
  /** Count of tested nonces accumulated in the current stats window. */
  private testedNonces = 0n
  /** Reused 84-byte scratch for partial header construction. */
  private partialHeaderScratch = new Uint8Array(84)
  /** Reused 21-word partial header view uploaded to GPU. */
  private partialHeaderWords = new Uint32Array(
    MINER_DEFAULTS.PARTIAL_HEADER_U32_LENGTH,
  )
  /** Device-limited nonce capacity for one `miner.run()` call. */
  private maxNonceCountPerSearch = 0

  constructor(private readonly settings: LotusMiningSettings) {
    this.rpc = new LotusRpcClient(settings.rpc)
    this.miner = new WebGpuMiner()
  }

  /**
   * Initialize GPU runtime and launch the asynchronous mining loop.
   */
  async start(): Promise<void> {
    if (this.running) return
    this.running = true
    this.latestError = ''
    this.testedNonces = 0n
    this.metricsStart = Date.now()

    try {
      await this.miner.init({
        gpuPreferences: this.settings.gpuPreferences,
        iterations:
          this.settings.iterations ?? MINER_DEFAULTS.DEFAULT_ITERATIONS,
        workgroupSize: MINER_DEFAULTS.DEFAULT_WORKGROUP_SIZE,
      })

      this.maxNonceCountPerSearch = this.miner.maxNonceCountPerDispatch

      // Prime work immediately before periodic polling begins.
      await this.updateNextBlock()

      const pollMs =
        this.settings.rpcPollIntervalMs ?? MINER_DEFAULTS.DEFAULT_RPC_POLL_MS
      this.blockPollTimer = globalThis.setInterval(() => {
        void this.updateNextBlock().catch(err =>
          console.error('updateNextBlock error', err),
        )
      }, pollMs)

      // Keep loop detached from caller to preserve fire-and-forget runtime model.
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

  /**
   * Stop mining and release GPU resources.
   */
  stop(): void {
    this.running = false
    this.currentTip = null
    if (this.blockPollTimer !== null) {
      clearInterval(this.blockPollTimer)
      this.blockPollTimer = null
    }
    this.miner.destroy()
  }

  /**
   * Get current stats snapshot (hashrate + tested nonce count).
   */
  getStats(): MiningStats {
    const elapsedSec = Math.max(0.001, (Date.now() - this.metricsStart) / 1000)
    return {
      hashrate: Number(this.testedNonces) / elapsedSec,
      testedNonces: this.testedNonces,
    }
  }

  /** True while the mining loop is active. */
  get isRunning(): boolean {
    return this.running
  }

  /** Last captured runtime error, if any. */
  get lastError(): string {
    return this.latestError
  }

  /**
   * Refresh pending block template from RPC.
   */
  private async updateNextBlock(): Promise<void> {
    const unsolved = await this.rpc.getRawUnsolvedBlock(
      this.settings.mineToAddress,
    )
    if (!unsolved) {
      return
    }

    const block = createBlock(unsolved)
    const nextPrev = prevHash(block)
    if (!this.currentTip || !this.equal32(this.currentTip, nextPrev)) {
      this.currentTip = nextPrev.slice(0, 32)
      console.info('Switched mining tip:', bytesToHex(reverseBytes(nextPrev)))
    }
    this.nextBlock = block
  }

  /**
   * Execute one mining batch over a nonce range and handle candidate submission.
   */
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
      this.settings.iterations ?? MINER_DEFAULTS.DEFAULT_ITERATIONS
    const kernelSize =
      this.settings.kernelSize ?? MINER_DEFAULTS.DEFAULT_KERNEL_SIZE
    const requestedNoncesPerSearch = BigInt(kernelSize) * BigInt(iterations)
    const maxDispatchNonces = BigInt(this.maxNonceCountPerSearch)
    const numNoncesPerSearch =
      requestedNoncesPerSearch > maxDispatchNonces
        ? maxDispatchNonces
        : requestedNoncesPerSearch

    const baseBig = BigInt(this.currentWork.nonceIdx) * numNoncesPerSearch
    if (baseBig > BigInt(0xffffffff)) {
      // Prevent hot-loop spam and wasted CPU: discard stale work and wait for fresh block template.
      this.currentWork = null
      this.nextBlock = null
      return
    }
    const base = Number(baseBig)

    // Each dispatch explores a 64-bit nonce space chunk with random high word.
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
    const foundNonce = ((bigNonce >> 32n) << 32n) | BigInt(nonceLow >>> 0)

    this.setBigNonce(this.currentWork.header, foundNonce)

    const hash = await lotusHash(this.currentWork.header)
    if (!this.isHashBelowTarget(hash, this.currentWork.target)) {
      return
    }

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

  /**
   * Build 21-word partial header consumed by the Lotus kernel.
   */
  private async buildPartialHeader(
    header160: Uint8Array,
  ): Promise<Uint32Array> {
    const partialHeader = this.partialHeaderScratch
    partialHeader.set(header160.subarray(0, 52), 0)

    // tx-layer hash = SHA-256(header[52..160])
    const txLayerView = header160.subarray(52)
    const txLayerHash = await crypto.subtle.digest(
      'SHA-256',
      txLayerView as BufferSource,
    )
    partialHeader.set(new Uint8Array(txLayerHash), 52)

    // Kernel expects big-endian u32 words, same layout as reference miner.
    const out = this.partialHeaderWords
    const dv = new DataView(partialHeader.buffer, partialHeader.byteOffset, 84)
    for (let i = 0; i < MINER_DEFAULTS.PARTIAL_HEADER_U32_LENGTH; i++) {
      out[i] = dv.getUint32(i * 4, false)
    }
    return out
  }

  /** Compare first 32 bytes of two arrays. */
  private equal32(val1: Uint8Array, val2: Uint8Array): boolean {
    if (val1.length < 32 || val2.length < 32) {
      return false
    }
    for (let i = 0; i < 32; i++) {
      if (val1[i] !== val2[i]) {
        return false
      }
    }
    return true
  }

  /**
   * Serialize solved block bytes into RPC `submitblock` hex payload.
   */
  private serializeSolvedBlockHex(
    solvedHeader: Uint8Array,
    body: Uint8Array,
  ): string {
    const bytes = new Uint8Array(solvedHeader.length + body.length)
    bytes.set(solvedHeader, 0)
    bytes.set(body, solvedHeader.length)
    return bytesToHex(bytes)
  }

  /**
   * Periodically emit hashrate logs and reset window counters.
   */
  private maybeReportHashrate(): void {
    const windowMs =
      this.settings.hashrateWindowMs ??
      MINER_DEFAULTS.DEFAULT_HASHRATE_WINDOW_MS
    const elapsed = Date.now() - this.metricsStart
    if (elapsed < windowMs) return

    const hashrate = Number(this.testedNonces) / (elapsed / 1000)
    console.info(`Hashrate ${(hashrate / 1_000_000).toFixed(3)} MH/s`)
    this.testedNonces = 0n
    this.metricsStart = Date.now()
  }

  /**
   * Write a 64-bit nonce into header bytes 44..51 as little-endian words.
   */
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

  /**
   * Convert u32 endianness (big <-> little) for kernel nonce word handling.
   */
  private swapU32(v: number): number {
    return (
      (((v & 0xff) << 24) |
        ((v & 0xff00) << 8) |
        ((v >>> 8) & 0xff00) |
        ((v >>> 24) & 0xff)) >>>
      0
    )
  }

  /**
   * Generate a random unsigned 64-bit value via WebCrypto.
   */
  private randomU64(): bigint {
    const bytes = new Uint8Array(8)
    crypto.getRandomValues(bytes)
    const dv = new DataView(bytes.buffer)
    const low = BigInt(dv.getUint32(0, true))
    const high = BigInt(dv.getUint32(4, true))
    return (high << 32n) | low
  }

  /**
   * Compare hash and target as little-endian 256-bit values.
   *
   * This mirrors `lotus-gpu-miner` CPU-side validation before `submitblock`.
   */
  private isHashBelowTarget(hash: Uint8Array, target: Uint8Array): boolean {
    for (let i = hash.length - 1; i >= 0; i--) {
      const h = hash[i] ?? 0
      const t = target[i] ?? 0
      if (h > t) {
        return false
      }
      if (t > h) {
        return true
      }
    }
    return false
  }
}
