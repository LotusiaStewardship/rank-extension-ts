/**
 * Initialization options for {@link WebGpuMiner}.
 */
export type MinerInitParams = {
  /** WGSL source code for the compute kernel (`search` entrypoint required). */
  shaderCode?: string
  /** Ordered adapter preference list tried during adapter discovery. */
  gpuPreferences?: Array<'high-performance' | 'low-power'>
  /** OpenCL-style ITERATIONS override constant. */
  iterations?: number
  /** Must match `@workgroup_size` in the shader. */
  workgroupSize?: number
  /** Output storage u32 length. Minimum 2 (`found`, `nonceLow`). */
  outputU32Length?: number
}

/** One GPU dispatch request. */
export type MinerJob = {
  /** First nonce offset for this dispatch. */
  offset: number
  /** Number of candidate nonces requested for this dispatch. */
  nonceCount: number
}

/**
 * GPU dispatch result payload.
 */
export type MinerBatchResult = {
  /** True when kernel set output[0] == 1. */
  found: boolean
  /** Candidate low 32-bit nonce word (kernel-endian). */
  nonceLow: number
  /** Full output buffer snapshot from GPU readback. */
  raw: Uint32Array
}
