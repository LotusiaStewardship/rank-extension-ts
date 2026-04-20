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
  readbackBuffer: GPUBuffer
  outputU32Length: number
  workgroupSize: number
  iterations: number
}

export class WebGpuMiner {
  private runtime: WebGpuMinerRuntime | null = null
  private partialHeaderReady = false

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
      129,
    )

    const adapter = await navigator.gpu.requestAdapter()
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

    const readbackBuffer = device.createBuffer({
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
      readbackBuffer,
      outputU32Length,
      workgroupSize,
      iterations,
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

  async run(job: MinerJob): Promise<MinerBatchResult> {
    const runtime = this.assertRuntime()

    if (job.partialHeader) {
      this.setPartialHeader(job.partialHeader)
    }
    if (!this.partialHeaderReady) {
      throw new Error('No partialHeader has been uploaded yet')
    }

    const params = new Uint32Array(MINER_CONSTANTS.PARAMS_U32_LENGTH)
    params[0] = job.offset >>> 0
    runtime.queue.writeBuffer(runtime.paramsBuffer, 0, params)

    runtime.queue.writeBuffer(
      runtime.outputBuffer,
      0,
      new Uint32Array(runtime.outputU32Length),
    )

    const noncesPerWorkgroup = runtime.workgroupSize * runtime.iterations
    const dispatchX = Math.max(
      1,
      Math.ceil(job.nonceCount / noncesPerWorkgroup),
    )

    const encoder = runtime.device.createCommandEncoder()
    const pass = encoder.beginComputePass()
    pass.setPipeline(runtime.pipeline)
    pass.setBindGroup(0, runtime.bindGroup)
    pass.dispatchWorkgroups(dispatchX)
    pass.end()

    encoder.copyBufferToBuffer(
      runtime.outputBuffer,
      0,
      runtime.readbackBuffer,
      0,
      runtime.outputU32Length * 4,
    )

    runtime.queue.submit([encoder.finish()])
    await runtime.queue.onSubmittedWorkDone()

    await runtime.readbackBuffer.mapAsync(GPUMapMode.READ)
    const mapped = runtime.readbackBuffer.getMappedRange()
    const raw = new Uint32Array(mapped.slice(0))
    runtime.readbackBuffer.unmap()

    return {
      found: raw[MINER_CONSTANTS.FOUND_INDEX] === 1,
      nonceSlots: raw.slice(0, MINER_CONSTANTS.SLOT_COUNT),
      raw,
    }
  }

  destroy(): void {
    if (!this.runtime) return
    this.runtime.paramsBuffer.destroy()
    this.runtime.partialHeaderBuffer.destroy()
    this.runtime.outputBuffer.destroy()
    this.runtime.readbackBuffer.destroy()
    this.runtime = null
    this.partialHeaderReady = false
  }

  private assertRuntime(): WebGpuMinerRuntime {
    if (!this.runtime) {
      throw new Error('WebGpuMiner is not initialized')
    }
    return this.runtime
  }
}
