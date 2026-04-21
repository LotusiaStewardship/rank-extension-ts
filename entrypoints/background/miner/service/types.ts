import type { LotusRpcSettings } from '@/entrypoints/background/miner/network'
import type { MinerGpuPreference } from '@/entrypoints/background/stores/miner'

/**
 * High-level settings used to run the mining service.
 */
export type LotusMiningSettings = {
  /** Lotus payout address used with `getrawunsolvedblock`. */
  mineToAddress: string
  /** RPC connectivity/authentication details. */
  rpc: LotusRpcSettings
  /** Optional GPU adapter preference order. */
  gpuPreferences?: MinerGpuPreference[]
  /** Poll interval for fetching fresh block templates. */
  rpcPollIntervalMs?: number
  /** Kernel iterations override. */
  iterations?: number
  /** Reference miner kernel size equivalent. */
  kernelSize?: number
  /** Window used for periodic hashrate logs. */
  hashrateWindowMs?: number
}

/**
 * Runtime mining metrics snapshot.
 */
export type MiningStats = {
  /** Current estimated hashes/nonces per second. */
  hashrate: number
  /** Total tested nonces during current accounting window. */
  testedNonces: bigint
}

/**
 * In-memory work packet currently being mined.
 */
type Work = {
  /** 160-byte mutable header (nonce bytes are mutated in place). */
  header: Uint8Array
  /** Block body appended unchanged when submitting solved block. */
  body: Uint8Array
  /** Little-endian 256-bit target threshold. */
  target: Uint8Array
  /** Monotonic dispatch counter within the current template. */
  nonceIdx: number
}

/** Public alias for active mining work payload. */
export type MiningWork = Work
