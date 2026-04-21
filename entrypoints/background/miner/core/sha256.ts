/**
 * Compute a SHA-256 digest using WebCrypto.
 */
export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', data as BufferSource)
  return new Uint8Array(digest)
}

/**
 * Compute Lotus PoW hash for a full 160-byte header.
 *
 * Mirrors `lotus-gpu-miner/lotus-miner-lib/src/sha256.rs::lotus_hash`:
 * 1) hash tx-layer bytes (offset 52..160)
 * 2) build and hash pow-layer (20 bytes + tx hash)
 * 3) build and hash chain-layer (prev hash + pow hash)
 *
 * @param header160 Unsolved block header bytes (must be exactly 160 bytes).
 */
export async function lotusHash(header160: Uint8Array): Promise<Uint8Array> {
  if (header160.length !== 160) {
    throw new Error(
      `lotusHash expects 160-byte header, got ${header160.length}`,
    )
  }

  const txLayerHash = await sha256(header160.slice(52))

  const powLayer = new Uint8Array(52)
  powLayer.set(header160.slice(32, 52), 0)
  powLayer.set(txLayerHash, 20)
  const powLayerHash = await sha256(powLayer)

  const chainLayer = new Uint8Array(64)
  chainLayer.set(header160.slice(0, 32), 0)
  chainLayer.set(powLayerHash, 32)

  return sha256(chainLayer)
}
