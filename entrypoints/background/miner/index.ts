/**
 * Miner module barrel.
 *
 * Exposes GPU primitives, RPC client, offscreen orchestration, hashing utils,
 * and end-to-end mining service APIs.
 */
export { LOTUS_OG_WGSL, WebGpuMiner } from './gpu'
export { LotusRpcClient } from './network'
export {
  OffscreenMinerController,
} from './offscreen-controller'
export {
  mapConfigToMiningSettings,
  createDefaultMinerStatus,
  OFFSCREEN_MINER_CHANNEL,
} from './offscreen-protocol'
export {
  hexToBytes,
  bytesToHex,
  reverseBytes,
  sha256,
  lotusHash,
  createBlock,
  prevHash,
} from './core'
export { LotusMiningService } from './service'
export type {
  MinerInitParams,
  MinerJob,
  MinerBatchResult,
  LotusMiningSettings,
  MiningStats,
  MiningWork,
  LotusRpcSettings,
  RawUnsolvedBlockAndTarget,
  LotusBlock,
} from './types'
