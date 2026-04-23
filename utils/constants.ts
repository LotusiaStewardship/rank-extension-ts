export const DEFAULT_RANK_API = 'https://rank.lotusia.org/api/v1' // fetch profile/post rankings
export const DEFAULT_RANK_THRESHOLD = 0n // profiles/posts ranked below will be hidden
export const DEFAULT_RANK_TTL = 10 // number of seconds profile/post ranking is valid before refresh
// Wallet constants
export const WALLET_CHRONIK_URL = 'https://chronik.lotusia.org'
export const WALLET_BIP44_PURPOSE = 44
export const WALLET_BIP44_COINTYPE = 10605
export const WALLET_BIP39_MIN_WORDS = 12
export const WALLET_BIP39_MAX_WORDS = 24
export const WALLET_LOTUS_DECIMAL_PRECISION = 6
export const WALLET_MAX_TX_SIZE = 100_000 // bytes
export const WALLET_MAX_TX_INPUTS = 600 // inputs
// RANK tx constants
export const RANK_OUTPUT_MIN_VALUE = 100_000_000
// Explorer constants
export const DEFAULT_EXPLORER_URL = 'https://explorer.lotusia.org'

export enum HTTP {
  UNAUTHORIZED = 401,
}

/**
 * Shared numeric constants for the WebGPU miner pipeline.
 *
 * These values are intentionally centralized to keep host-side TypeScript
 * buffers/layouts aligned with the WGSL kernel contract.
 */
export const MINER_DEFAULTS = {
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
   * OpenCL-compatible output shape: nonce slots [0..0x7f] + found flag at 0x80.
   */
  DEFAULT_OUTPUT_U32_LENGTH: 0x81,
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
  /** Output buffer index storing the found flag (`output[0x80]`). */
  FOUND_INDEX: 0x80,
  /** Bitmask used by kernel to place candidate nonce slots (`output[nonce & mask]`). */
  NONCE_MASK: 0x7f,
  /** Default polling interval for refreshing RPC block templates. */
  DEFAULT_RPC_POLL_MS: 3000,
  /** Default hashrate logging/reporting window. */
  DEFAULT_HASHRATE_WINDOW_MS: 5000,
  /** Default performance telemetry reporting window. */
  DEFAULT_TELEMETRY_WINDOW_MS: 5000,
  /**
   * OpenCL-style kernel size baseline from reference miner.
   * Effective nonces per search = `kernelSize * iterations` (clamped by device limits).
   */
  DEFAULT_KERNEL_SIZE: 1 << 17,
} as const
