export type MinerInitParams = {
  /** WGSL source code for the compute kernel */
  shaderCode?: string
  /** OpenCL-style ITERATIONS override constant */
  iterations?: number
  /** Must match @workgroup_size in shader */
  workgroupSize?: number
  /** Output storage u32 length, must be >= 129 for lotus_og behavior */
  outputU32Length?: number
}

export type MinerJob = {
  /** First nonce for this dispatch */
  offset: number
  /** Number of nonces to test in this dispatch */
  nonceCount: number
}

export type MinerBatchResult = {
  /** output[0] == 1 */
  found: boolean
  /** Candidate low 32-bit nonce word (kernel-endian) */
  nonceLow: number
  /** Full output buffer */
  raw: Uint32Array
}
