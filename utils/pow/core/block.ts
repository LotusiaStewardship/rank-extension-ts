/** Raw RPC shape from `getrawunsolvedblock`. */
export interface RawUnsolvedBlockAndTarget {
  /** Full block bytes (header + body) as hex. */
  blockhex: string
  /** Target threshold in big-endian hex (32 bytes). */
  target: string
}

/**
 * Parsed mining template used by host and GPU code.
 */
export interface LotusBlock {
  /** Fixed-size 160-byte header used for nonce mutation and hashing. */
  header: Uint8Array
  /** Remaining block bytes after the header (transactions / body). */
  body: Uint8Array
  /** little-endian target bytes, matching lotus-gpu-miner behavior */
  target: Uint8Array
}

/**
 * Convert RPC template payload into split binary block parts.
 *
 * @throws If header/target sizes are not valid for Lotus mining.
 */
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

/**
 * Extract the previous block hash from a Lotus header.
 * Returns bytes as stored in the header (network little-endian representation).
 */
export function prevHash(block: LotusBlock): Uint8Array {
  return block.header.slice(0, 32)
}
