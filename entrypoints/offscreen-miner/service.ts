import { WebGpuMiner } from './webgpu-miner'
import { LotusRpcClient } from './rpc'

type MiningTelemetryWindow = {
  windowStartMs: number
  testedNonces: bigint
  dispatches: number
  idleLoops: number
  templateFetches: number
  templateFetchMs: number
  noncePrepMs: number
  partialHeaderBuildMs: number
  partialHeaderUploadMs: number
  gpuHostEncodeMs: number
  gpuSubmitToReadbackMs: number
  gpuReadbackCopyMs: number
  gpuParseMs: number
  gpuTotalMs: number
  candidateSlotsScanned: number
  candidateScanMs: number
  candidateHashChecks: number
  candidateHashMs: number
  submitCount: number
  submitMs: number
}

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
  /** Rolling telemetry counters used to surface pipeline bottlenecks. */
  private telemetryWindow: MiningTelemetryWindow = this.newTelemetryWindow()

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
    this.telemetryWindow = this.newTelemetryWindow()

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
    const fetchStart = performance.now()
    const unsolved = await this.rpc.getRawUnsolvedBlock(
      this.settings.mineToAddress,
    )
    this.telemetryWindow.templateFetches += 1
    this.telemetryWindow.templateFetchMs += performance.now() - fetchStart
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
      this.telemetryWindow.idleLoops += 1
      return
    }

    const iterations =
      this.settings.iterations ?? MINER_DEFAULTS.DEFAULT_ITERATIONS
    const kernelSize =
      this.settings.kernelSize ?? MINER_DEFAULTS.DEFAULT_KERNEL_SIZE
    const requestedNoncesPerSearch = BigInt(kernelSize) * BigInt(iterations)
    const maxDispatchNonces = BigInt(this.maxNonceCountPerSearch)
    const noncesPerWorkgroup = BigInt(this.miner.noncesPerWorkgroup)

    let numNoncesPerSearch =
      requestedNoncesPerSearch > maxDispatchNonces
        ? maxDispatchNonces
        : requestedNoncesPerSearch

    // WebGPU dispatch granularity is whole workgroups. Keep batches aligned so
    // offset progression exactly matches covered nonce ranges (no silent tail loss).
    numNoncesPerSearch =
      (numNoncesPerSearch / noncesPerWorkgroup) * noncesPerWorkgroup
    if (numNoncesPerSearch === 0n) {
      numNoncesPerSearch = noncesPerWorkgroup
    }

    const baseBig = BigInt(this.currentWork.nonceIdx) * numNoncesPerSearch
    if (baseBig > BigInt(0xffffffff)) {
      // Prevent hot-loop spam and wasted CPU: discard stale work and wait for fresh block template.
      this.currentWork = null
      this.nextBlock = null
      return
    }
    const base = Number(baseBig)

    // Each dispatch explores a 64-bit nonce space chunk with random high word.
    const noncePrepStart = performance.now()
    const bigNonce = this.randomU64()
    this.setBigNonce(this.currentWork.header, bigNonce)
    this.telemetryWindow.noncePrepMs += performance.now() - noncePrepStart

    const partialHeaderBuildStart = performance.now()
    const partialHeader = await this.buildPartialHeader(this.currentWork.header)
    this.telemetryWindow.partialHeaderBuildMs +=
      performance.now() - partialHeaderBuildStart

    const partialHeaderUploadStart = performance.now()
    this.miner.setPartialHeader(partialHeader)
    this.telemetryWindow.partialHeaderUploadMs +=
      performance.now() - partialHeaderUploadStart

    const result = await this.miner.run({
      offset: base,
      nonceCount: Number(numNoncesPerSearch),
    })

    this.telemetryWindow.dispatches += 1
    this.telemetryWindow.testedNonces += numNoncesPerSearch
    this.telemetryWindow.gpuHostEncodeMs += result.telemetry.hostEncodeMs
    this.telemetryWindow.gpuSubmitToReadbackMs +=
      result.telemetry.submitToReadbackMs
    this.telemetryWindow.gpuReadbackCopyMs += result.telemetry.readbackCopyMs
    this.telemetryWindow.gpuParseMs += result.telemetry.parseMs
    this.telemetryWindow.gpuTotalMs += result.telemetry.totalMs

    this.currentWork.nonceIdx += 1
    this.testedNonces += numNoncesPerSearch
    this.maybeReportHashrate()
    this.maybeReportTelemetry()

    if (!result.found) {
      return
    }

    const work = this.currentWork
    const candidateScanStart = performance.now()
    for (let i = 0; i <= MINER_DEFAULTS.NONCE_MASK; i++) {
      this.telemetryWindow.candidateSlotsScanned += 1
      const candidate = result.raw[i] ?? 0
      if (candidate === 0) {
        continue
      }

      const nonceLow = this.swapU32(candidate)
      if (nonceLow === 0) {
        continue
      }

      const foundNonce = ((bigNonce >> 32n) << 32n) | BigInt(nonceLow >>> 0)
      this.setBigNonce(work.header, foundNonce)

      const hashStart = performance.now()
      const hash = await lotusHash(work.header)
      this.telemetryWindow.candidateHashChecks += 1
      this.telemetryWindow.candidateHashMs += performance.now() - hashStart
      if (!this.isHashBelowTarget(hash, work.target)) {
        continue
      }

      console.info('Block hash below target with nonce:', foundNonce.toString())

      const solvedBlockHex = this.serializeSolvedBlockHex(work.header, work.body)

      // Match reference miner flow: stop mining this template immediately after
      // finding a valid candidate, regardless of submission result.
      this.currentWork = null

      const submitStart = performance.now()
      const submitResult = await this.rpc.submitBlock(solvedBlockHex)
      this.telemetryWindow.submitCount += 1
      this.telemetryWindow.submitMs += performance.now() - submitStart
      if (submitResult === null) {
        console.info('BLOCK ACCEPTED!')
      } else {
        console.error('REJECTED BLOCK:', submitResult)
      }

      this.telemetryWindow.candidateScanMs +=
        performance.now() - candidateScanStart

      // Immediately fetch fresh template instead of waiting for next poll tick.
      await this.updateNextBlock()
      return
    }

    this.telemetryWindow.candidateScanMs += performance.now() - candidateScanStart
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
   * Aggregate and emit pipeline timing telemetry to identify dominant bottlenecks.
   */
  private maybeReportTelemetry(): void {
    if (this.settings.telemetryEnabled === false) {
      return
    }

    const telemetryWindowMs =
      this.settings.telemetryWindowMs ??
      MINER_DEFAULTS.DEFAULT_TELEMETRY_WINDOW_MS
    const elapsedMs = Date.now() - this.telemetryWindow.windowStartMs
    if (elapsedMs < telemetryWindowMs) {
      return
    }

    const window = this.telemetryWindow
    const elapsedSec = Math.max(0.001, elapsedMs / 1000)
    const testedNonces = Number(window.testedNonces)
    const hashrate = testedNonces / elapsedSec

    const dispatches = Math.max(1, window.dispatches)
    const avgGpuTotalMs = window.gpuTotalMs / dispatches
    const avgGpuSubmitToReadbackMs = window.gpuSubmitToReadbackMs / dispatches
    const avgHeaderBuildMs = window.partialHeaderBuildMs / dispatches

    const avgCandidateSlotsScanned =
      window.dispatches === 0
        ? 0
        : window.candidateSlotsScanned / window.dispatches

    console.info('[MINER_TELEMETRY]', {
      windowMs: elapsedMs,
      dispatches: window.dispatches,
      idleLoops: window.idleLoops,
      testedNonces,
      hashrateMhs: hashrate / 1_000_000,
      effectiveDispatchesPerSec: window.dispatches / elapsedSec,
      effectiveMNoncesPerDispatch:
        window.dispatches === 0 ? 0 : testedNonces / window.dispatches / 1_000_000,
      stageTotalsMs: {
        templateFetch: window.templateFetchMs,
        noncePrep: window.noncePrepMs,
        partialHeaderBuild: window.partialHeaderBuildMs,
        partialHeaderUpload: window.partialHeaderUploadMs,
        gpuHostEncode: window.gpuHostEncodeMs,
        gpuSubmitToReadback: window.gpuSubmitToReadbackMs,
        gpuReadbackCopy: window.gpuReadbackCopyMs,
        gpuParse: window.gpuParseMs,
        gpuTotal: window.gpuTotalMs,
        candidateScan: window.candidateScanMs,
        candidateHash: window.candidateHashMs,
        submit: window.submitMs,
      },
      stageAveragesMs: {
        gpuTotalPerDispatch: avgGpuTotalMs,
        gpuSubmitToReadbackPerDispatch: avgGpuSubmitToReadbackMs,
        partialHeaderBuildPerDispatch: avgHeaderBuildMs,
        templateFetchPerPoll:
          window.templateFetches === 0
            ? 0
            : window.templateFetchMs / window.templateFetches,
        candidateHashPerCheck:
          window.candidateHashChecks === 0
            ? 0
            : window.candidateHashMs / window.candidateHashChecks,
        submitPerCall:
          window.submitCount === 0 ? 0 : window.submitMs / window.submitCount,
      },
      counters: {
        templateFetches: window.templateFetches,
        candidateSlotsScanned: window.candidateSlotsScanned,
        avgCandidateSlotsScannedPerDispatch: avgCandidateSlotsScanned,
        candidateHashChecks: window.candidateHashChecks,
        submitCount: window.submitCount,
      },
    })

    this.telemetryWindow = this.newTelemetryWindow()
  }

  /**
   * Construct a fresh rolling telemetry bucket.
   */
  private newTelemetryWindow(): MiningTelemetryWindow {
    return {
      windowStartMs: Date.now(),
      testedNonces: 0n,
      dispatches: 0,
      idleLoops: 0,
      templateFetches: 0,
      templateFetchMs: 0,
      noncePrepMs: 0,
      partialHeaderBuildMs: 0,
      partialHeaderUploadMs: 0,
      gpuHostEncodeMs: 0,
      gpuSubmitToReadbackMs: 0,
      gpuReadbackCopyMs: 0,
      gpuParseMs: 0,
      gpuTotalMs: 0,
      candidateSlotsScanned: 0,
      candidateScanMs: 0,
      candidateHashChecks: 0,
      candidateHashMs: 0,
      submitCount: 0,
      submitMs: 0,
    }
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
