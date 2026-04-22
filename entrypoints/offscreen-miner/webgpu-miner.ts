/// <reference types="@webgpu/types" />
/**
 * Internal runtime resources allocated after `init()`.
 */
type WebGpuMinerRuntime = {
  /** Logical device used for compute pipeline + buffers. */
  device: GPUDevice
  /** GPU queue used for uploads, dispatch submission, and readback scheduling. */
  queue: GPUQueue
  /** Compiled `search` compute pipeline. */
  pipeline: GPUComputePipeline
  /** Bind group wiring params/header/output buffers to set 0. */
  bindGroup: GPUBindGroup
  /** Uniform buffer containing dispatch params. */
  paramsBuffer: GPUBuffer
  /** Storage buffer containing precomputed partial header words. */
  partialHeaderBuffer: GPUBuffer
  /** Storage buffer written by the kernel (`output[0x80]` flag + nonce slots). */
  outputBuffer: GPUBuffer
  /** Double-buffered readback targets to avoid map hazards between dispatches. */
  readbackBuffers: [GPUBuffer, GPUBuffer]
  /** Alternates active readback buffer each run. */
  readbackCursor: 0 | 1
  /** Output u32 length used for output and readback buffers. Must include index 0x80. */
  outputU32Length: number
  /** Device maximum allowed dispatch dimension on X axis. */
  maxDispatchX: number
  /** Workgroup size expected by shader. */
  workgroupSize: number
  /** Iterations override constant injected into pipeline. */
  iterations: number
  /** Zeroed output upload scratch used before each dispatch. */
  zeroOutput: Uint32Array
  /** Uniform params scratch array (`offset`, `target0`, `target1`, `target2`). */
  paramsScratch: Uint32Array
  /** Full 256-bit target scratch as little-endian u32 words. */
  targetScratch: Uint32Array
  /** Reused CPU-side output snapshot buffer. */
  rawScratch: Uint32Array
}

/**
 * Low-level WebGPU mining runner.
 *
 * This class owns GPU resources and executes the Lotus kernel in batches.
 * It does not fetch blocks, manage nonce strategy, or submit solutions.
 */
export class WebGpuMiner {
  private runtime: WebGpuMinerRuntime | null = null
  private partialHeaderReady = false
  private targetReady = false

  /**
   * Maximum nonce capacity for a single dispatch on the active device.
   */
  public get maxNonceCountPerDispatch(): number {
    const runtime = this.assertRuntime()
    return runtime.maxDispatchX * runtime.workgroupSize * runtime.iterations
  }

  /** True once `init()` succeeded and resources are allocated. */
  public get isReady(): boolean {
    return this.runtime !== null
  }

  /**
   * Allocate GPU resources and compile the compute pipeline.
   */
  async init(params: MinerInitParams = {}): Promise<void> {
    if (!('gpu' in navigator) || !navigator.gpu) {
      throw new Error('WebGPU is not supported in this browser runtime')
    }

    const shaderCode = params.shaderCode ?? LOTUS_OG_WGSL
    const iterations = params.iterations ?? MINER_DEFAULTS.DEFAULT_ITERATIONS
    const workgroupSize =
      params.workgroupSize ?? MINER_DEFAULTS.DEFAULT_WORKGROUP_SIZE
    const outputU32Length = Math.max(
      params.outputU32Length ?? MINER_DEFAULTS.DEFAULT_OUTPUT_U32_LENGTH,
      MINER_DEFAULTS.FOUND_INDEX + 1,
    )

    const adapter = await this.requestAdapter(params.gpuPreferences)
    if (!adapter) {
      throw new Error(
        'No available adapters. WebGPU may be disabled in this Chromium runtime, or the browser may not expose a usable GPU adapter to extension service workers.',
      )
    }

    const device = await adapter.requestDevice()
    const queue = device.queue

    const shaderModule = device.createShaderModule({ code: shaderCode })

    const pipeline = await device.createComputePipelineAsync({
      layout: 'auto',
      compute: {
        module: shaderModule,
        entryPoint: 'search',
        constants: {
          ITERATIONS: iterations,
        },
      },
    })

    const paramsBuffer = device.createBuffer({
      size: MINER_DEFAULTS.PARAMS_U32_LENGTH * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })

    const partialHeaderBuffer = device.createBuffer({
      size: MINER_DEFAULTS.PARTIAL_HEADER_U32_LENGTH * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    })

    const outputBuffer = device.createBuffer({
      size: outputU32Length * 4,
      usage:
        GPUBufferUsage.STORAGE |
        GPUBufferUsage.COPY_SRC |
        GPUBufferUsage.COPY_DST,
    })

    const readbackBufferA = device.createBuffer({
      size: outputU32Length * 4,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    })

    const readbackBufferB = device.createBuffer({
      size: outputU32Length * 4,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    })

    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: paramsBuffer } },
        { binding: 1, resource: { buffer: partialHeaderBuffer } },
        { binding: 2, resource: { buffer: outputBuffer } },
      ],
    })

    this.runtime = {
      device,
      queue,
      pipeline,
      bindGroup,
      paramsBuffer,
      partialHeaderBuffer,
      outputBuffer,
      readbackBuffers: [readbackBufferA, readbackBufferB],
      readbackCursor: 0,
      outputU32Length,
      maxDispatchX: device.limits.maxComputeWorkgroupsPerDimension,
      workgroupSize,
      iterations,
      zeroOutput: new Uint32Array(outputU32Length),
      paramsScratch: new Uint32Array(MINER_DEFAULTS.PARAMS_U32_LENGTH),
      targetScratch: new Uint32Array(MINER_DEFAULTS.TARGET_U32_LENGTH),
      rawScratch: new Uint32Array(outputU32Length),
    }
  }

  /**
   * Upload the 21-word partial header payload consumed by the kernel.
   */
  setPartialHeader(partialHeader: Uint32Array): void {
    const runtime = this.assertRuntime()
    if (partialHeader.length < MINER_DEFAULTS.PARTIAL_HEADER_U32_LENGTH) {
      throw new Error(
        `partialHeader must contain at least ${MINER_DEFAULTS.PARTIAL_HEADER_U32_LENGTH} u32 values`,
      )
    }
    runtime.queue.writeBuffer(
      runtime.partialHeaderBuffer,
      0,
      partialHeader.buffer,
      partialHeader.byteOffset,
      MINER_DEFAULTS.PARTIAL_HEADER_U32_LENGTH * 4,
    )
    this.partialHeaderReady = true
  }

  /**
   * Store target threshold bytes (little-endian) for later params uploads.
   */
  setTarget(targetLe: Uint8Array): void {
    const runtime = this.assertRuntime()
    if (targetLe.length !== 32) {
      throw new Error(`target must be 32 bytes, got ${targetLe.length}`)
    }
    for (let i = 0; i < MINER_DEFAULTS.TARGET_U32_LENGTH; i++) {
      const o = i * 4
      runtime.targetScratch[i] =
        ((targetLe[o] ?? 0) |
          ((targetLe[o + 1] ?? 0) << 8) |
          ((targetLe[o + 2] ?? 0) << 16) |
          ((targetLe[o + 3] ?? 0) << 24)) >>>
        0
    }
    this.targetReady = true
  }

  /**
   * Execute one dispatch of the mining kernel and read back output state.
   */
  async run(job: MinerJob): Promise<MinerBatchResult> {
    const runtime = this.assertRuntime()

    if (!this.partialHeaderReady) {
      throw new Error('No partialHeader has been uploaded yet')
    }
    if (!this.targetReady) {
      throw new Error('No target has been uploaded yet')
    }

    // Kernel params are a compact subset expected by the WGSL `Params` struct.
    runtime.paramsScratch[0] = job.offset >>> 0
    runtime.paramsScratch[1] = runtime.targetScratch[5] ?? 0
    runtime.paramsScratch[2] = runtime.targetScratch[6] ?? 0
    runtime.paramsScratch[3] = runtime.targetScratch[7] ?? 0
    runtime.queue.writeBuffer(
      runtime.paramsBuffer,
      0,
      runtime.paramsScratch as GPUAllowSharedBufferSource,
    )

    // Reset output so stale success flags never leak across dispatches.
    runtime.queue.writeBuffer(
      runtime.outputBuffer,
      0,
      runtime.zeroOutput as GPUAllowSharedBufferSource,
    )

    const noncesPerWorkgroup = runtime.workgroupSize * runtime.iterations
    // Match OpenCL global_work_size behavior: exact kernel_size lanes per dispatch.
    // Any remainder is intentionally ignored, like the Rust/OpenCL reference miner.
    const dispatchXRequested = Math.max(
      1,
      Math.floor(job.nonceCount / noncesPerWorkgroup),
    )
    const dispatchX = Math.min(dispatchXRequested, runtime.maxDispatchX)

    const readback = runtime.readbackBuffers[runtime.readbackCursor]
    runtime.readbackCursor = runtime.readbackCursor === 0 ? 1 : 0

    const encoder = runtime.device.createCommandEncoder()
    const pass = encoder.beginComputePass()
    pass.setPipeline(runtime.pipeline)
    pass.setBindGroup(0, runtime.bindGroup)
    pass.dispatchWorkgroups(dispatchX)
    pass.end()

    encoder.copyBufferToBuffer(
      runtime.outputBuffer,
      0,
      readback,
      0,
      runtime.outputU32Length * 4,
    )

    runtime.queue.submit([encoder.finish()])

    await readback.mapAsync(GPUMapMode.READ)
    const mapped = readback.getMappedRange()
    runtime.rawScratch.set(new Uint32Array(mapped))
    readback.unmap()

    const raw = runtime.rawScratch

    const found = raw[MINER_DEFAULTS.FOUND_INDEX] === 1
    let nonceLow = 0
    if (found) {
      for (let i = 0; i <= MINER_DEFAULTS.NONCE_MASK; i++) {
        const candidate = raw[i] ?? 0
        if (candidate !== 0) {
          nonceLow = candidate
          break
        }
      }
    }

    return {
      found,
      nonceLow,
      raw,
    }
  }

  /**
   * Release all GPU resources and reset state flags.
   */
  destroy(): void {
    if (!this.runtime) return
    this.runtime.paramsBuffer.destroy()
    this.runtime.partialHeaderBuffer.destroy()
    this.runtime.outputBuffer.destroy()
    this.runtime.readbackBuffers[0].destroy()
    this.runtime.readbackBuffers[1].destroy()
    this.runtime = null
    this.partialHeaderReady = false
    this.targetReady = false
  }

  /**
   * Ensure runtime is initialized before any GPU operation.
   */
  private assertRuntime(): WebGpuMinerRuntime {
    if (!this.runtime) {
      throw new Error('WebGpuMiner is not initialized')
    }
    return this.runtime
  }

  /**
   * Request a GPU adapter using caller preference order, with plain fallback.
   */
  private async requestAdapter(
    gpuPreferences: Array<'high-performance' | 'low-power'> = [
      'high-performance',
      'low-power',
    ],
  ): Promise<GPUAdapter | null> {
    const attempts: Array<GPURequestAdapterOptions | undefined> = [undefined]

    // Prefer user-selected order, but still include plain request fallback.
    for (const powerPreference of gpuPreferences) {
      attempts.push({ powerPreference })
    }

    for (const options of attempts) {
      const adapter = await navigator.gpu.requestAdapter(options)
      if (adapter) {
        return adapter
      }
    }

    return null
  }
}
