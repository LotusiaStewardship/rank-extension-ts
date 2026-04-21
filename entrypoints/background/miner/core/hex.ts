/**
 * Decode a hexadecimal string into bytes.
 *
 * @param hex Hex string (with even length).
 * @returns Decoded bytes.
 * @throws If the input length is odd or includes non-hex characters.
 */
export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase()
  if (clean.length % 2 !== 0) {
    throw new Error(`Invalid hex length: ${clean.length}`)
  }
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) {
    const byte = clean.slice(i * 2, i * 2 + 2)
    const value = Number.parseInt(byte, 16)
    if (Number.isNaN(value)) {
      throw new Error(`Invalid hex byte: ${byte}`)
    }
    out[i] = value
  }
  return out
}

/**
 * Encode bytes into lowercase hexadecimal.
 */
export function bytesToHex(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i]!.toString(16).padStart(2, '0')
  }
  return out
}

/**
 * Return a reversed copy of a byte array.
 * Useful when converting between little-endian and big-endian byte ordering.
 */
export function reverseBytes(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) {
    out[i] = bytes[bytes.length - 1 - i]!
  }
  return out
}
