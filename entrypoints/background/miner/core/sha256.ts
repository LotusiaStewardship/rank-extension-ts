export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', data as BufferSource)
  return new Uint8Array(digest)
}

/**
 * Mirrors lotus-gpu-miner/lotus-miner-lib/src/sha256.rs::lotus_hash
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
