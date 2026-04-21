/**
 * Shared numeric constants for the WebGPU miner pipeline.
 *
 * These values are intentionally centralized to keep host-side TypeScript
 * buffers/layouts aligned with the WGSL kernel contract.
 */
export const MINER_CONSTANTS = {
  /**
   * Default ITERATIONS override passed into the WGSL compute pipeline.
   * One work-item tests this many sequential nonces.
   */
  DEFAULT_ITERATIONS: 16,
  /**
   * Required workgroup size for the bundled `LOTUS_OG_WGSL` kernel.
   * Must remain in sync with `@workgroup_size(256)`.
   */
  DEFAULT_WORKGROUP_SIZE: 256,
  /**
   * Minimal output shape from GPU: `[foundFlag, nonceLow]`.
   */
  DEFAULT_OUTPUT_U32_LENGTH: 2,
  /**
   * Number of u32 words uploaded as `partial_header` (84 bytes => 21 u32).
   */
  PARTIAL_HEADER_U32_LENGTH: 21,
  /**
   * Full target size in 32-bit words (256 bits => 8 u32).
   */
  TARGET_U32_LENGTH: 8,
  /**
   * Uniform parameter struct length in u32 words.
   * Layout: `offset`, `target0`, `target1`, `target2`.
   */
  PARAMS_U32_LENGTH: 4,
  /** Output buffer index storing the found flag. */
  FOUND_INDEX: 0,
  /** Output buffer index storing the candidate nonce low word. */
  NONCE_INDEX: 1,
  /** Default polling interval for refreshing RPC block templates. */
  DEFAULT_RPC_POLL_MS: 3000,
  /** Default hashrate logging/reporting window. */
  DEFAULT_HASHRATE_WINDOW_MS: 5000,
  /**
   * OpenCL-style kernel size baseline from reference miner.
   * Effective nonces per search = `kernelSize * iterations` (clamped by device limits).
   */
  DEFAULT_KERNEL_SIZE: 1 << 17,
} as const
