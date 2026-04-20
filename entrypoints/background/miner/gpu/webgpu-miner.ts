import { MINER_CONSTANTS } from '@/entrypoints/background/miner/constants'
import { LOTUS_OG_WGSL } from '@/entrypoints/background/miner/gpu/lotus-og-kernel'
import type {
  MinerBatchResult,
  MinerInitParams,
  MinerJob,
} from '@/entrypoints/background/miner/gpu/types'

type WebGpuMinerRuntime = {
  device: GPUDevice
  queue: GPUQueue
  pipeline: GPUComputePipeline
  bindGroup: GPUBindGroup
  paramsBuffer: GPUBuffer
  partialHeaderBuffer: GPUBuffer
  outputBuffer: GPUBuffer
  readbackBuffers: [GPUBuffer, GPUBuffer]
  readbackCursor: 0 | 1
  outputU32Length: number
  workgroupSize: number
  iterations: number
  zeroOutput: Uint32Array
  paramsScratch: Uint32Array
  targetScratch: Uint32Array
  rawScratch: Uint32Array
}

export class WebGpuMiner {
  private runtime: WebGpuMinerRuntime | null = null
  private partialHeaderReady = false
  private targetReady = false

  public get isReady(): boolean {
    return this.runtime !== null
  }

  async init(params: MinerInitParams = {}): Promise<void> {
    if (!('gpu' in navigator) || !navigator.gpu) {
      throw new Error('WebGPU is not supported in this browser runtime')
    }

    const shaderCode = params.shaderCode ?? LOTUS_OG_WGSL
    const iterations = params.iterations ?? MINER_CONSTANTS.DEFAULT_ITERATIONS
    const workgroupSize =
      params.workgroupSize ?? MINER_CONSTANTS.DEFAULT_WORKGROUP_SIZE
    const outputU32Length = Math.max(
      params.outputU32Length ?? MINER_CONSTANTS.DEFAULT_OUTPUT_U32_LENGTH,
      2,
    )

    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: 'high-performance',
    })
    if (!adapter) {
      throw new Error('No WebGPU adapter found')
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
      size: MINER_CONSTANTS.PARAMS_U32_LENGTH * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })

    const partialHeaderBuffer = device.createBuffer({
      size: MINER_CONSTANTS.PARTIAL_HEADER_U32_LENGTH * 4,
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
      workgroupSize,
      iterations,
      zeroOutput: new Uint32Array(outputU32Length),
      paramsScratch: new Uint32Array(MINER_CONSTANTS.PARAMS_U32_LENGTH),
      targetScratch: new Uint32Array(MINER_CONSTANTS.TARGET_U32_LENGTH),
      rawScratch: new Uint32Array(outputU32Length),
    }
  }

  setPartialHeader(partialHeader: Uint32Array): void {
    const runtime = this.assertRuntime()
    if (partialHeader.length < MINER_CONSTANTS.PARTIAL_HEADER_U32_LENGTH) {
      throw new Error(
        `partialHeader must contain at least ${MINER_CONSTANTS.PARTIAL_HEADER_U32_LENGTH} u32 values`,
      )
    }
    runtime.queue.writeBuffer(
      runtime.partialHeaderBuffer,
      0,
      partialHeader.buffer,
      partialHeader.byteOffset,
      MINER_CONSTANTS.PARTIAL_HEADER_U32_LENGTH * 4,
    )
    this.partialHeaderReady = true
  }

  setTarget(targetLe: Uint8Array): void {
    const runtime = this.assertRuntime()
    if (targetLe.length !== 32) {
      throw new Error(`target must be 32 bytes, got ${targetLe.length}`)
    }
    for (let i = 0; i < MINER_CONSTANTS.TARGET_U32_LENGTH; i++) {
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

  async run(job: MinerJob): Promise<MinerBatchResult> {
    const runtime = this.assertRuntime()

    if (!this.partialHeaderReady) {
      throw new Error('No partialHeader has been uploaded yet')
    }
    if (!this.targetReady) {
      throw new Error('No target has been uploaded yet')
    }

    runtime.paramsScratch[0] = job.offset >>> 0
    runtime.paramsScratch[1] = runtime.targetScratch[5] ?? 0
    runtime.paramsScratch[2] = runtime.targetScratch[6] ?? 0
    runtime.paramsScratch[3] = runtime.targetScratch[7] ?? 0
    runtime.queue.writeBuffer(
      runtime.paramsBuffer,
      0,
      runtime.paramsScratch as GPUAllowSharedBufferSource,
    )

    runtime.queue.writeBuffer(
      runtime.outputBuffer,
      0,
      runtime.zeroOutput as GPUAllowSharedBufferSource,
    )

    const noncesPerWorkgroup = runtime.workgroupSize * runtime.iterations
    // Match OpenCL global_work_size behavior: exact kernel_size lanes per dispatch.
    // Any remainder is intentionally ignored, like the Rust/OpenCL reference miner.
    const dispatchX = Math.max(
      1,
      Math.floor(job.nonceCount / noncesPerWorkgroup),
    )

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

    return {
      found: raw[MINER_CONSTANTS.FOUND_INDEX] === 1,
      nonceLow: raw[MINER_CONSTANTS.NONCE_INDEX] ?? 0,
      raw,
    }
  }

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

  private assertRuntime(): WebGpuMinerRuntime {
    if (!this.runtime) {
      throw new Error('WebGpuMiner is not initialized')
    }
    return this.runtime
  }
}
