import { hexToBytes, reverseBytes } from '@/entrypoints/background/miner/core/hex'

export type RawUnsolvedBlockAndTarget = {
  blockhex: string
  target: string
}

export type LotusBlock = {
  header: Uint8Array
  body: Uint8Array
  /** little-endian target bytes, matching lotus-gpu-miner behavior */
  target: Uint8Array
}

export function createBlock(data: RawUnsolvedBlockAndTarget): LotusBlock {
  const blockBytes = hexToBytes(data.blockhex)
  if (blockBytes.length < 160) {
    throw new Error(`Unsolved block too small: ${blockBytes.length} bytes`)
  }

  const targetBe = hexToBytes(data.target)
  if (targetBe.length !== 32) {
    throw new Error(`Target must be 32 bytes, got ${targetBe.length}`)
  }

  return {
    header: blockBytes.slice(0, 160),
    body: blockBytes.slice(160),
    target: reverseBytes(targetBe),
  }
}

export function prevHash(block: LotusBlock): Uint8Array {
  return block.header.slice(0, 32)
}
