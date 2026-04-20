import type { LotusRpcSettings } from '@/entrypoints/background/miner/network'

export type LotusMiningSettings = {
  mineToAddress: string
  rpc: LotusRpcSettings
  rpcPollIntervalMs?: number
  iterations?: number
  kernelSize?: number
  hashrateWindowMs?: number
}

export type MiningStats = {
  hashrate: number
  testedNonces: bigint
}

type Work = {
  header: Uint8Array
  body: Uint8Array
  target: Uint8Array
  nonceIdx: number
}

export type MiningWork = Work
