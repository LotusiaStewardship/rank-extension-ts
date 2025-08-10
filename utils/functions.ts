import { AuthorizationHeader } from '@/entrypoints/background/modules/instance'
import type { UtxoCache } from '@/entrypoints/background/modules/wallet'
import type {
  ExtensionInstance,
  PostMetaCache,
} from '@/entrypoints/background/stores'

export const toXPI = (sats: string) =>
  (Number(sats) / 1_000_000).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  })
export function isSha256(string: string) {
  return !!string.match(/^[a-f0-9]{64}$/)
}
export const toLotusUnits = (sats: string | number) => Number(sats) / 1_000_000
export const toSatoshiUnits = (xpi: string | number) => Number(xpi) * 1_000_000
export const toMinifiedNumber = (
  number: number | string,
  divisor: number = 1,
) => {
  const int = Math.floor(Number(number) / divisor)
  if (int >= 1e9) {
    return `${(int / 1e9).toFixed(1)}B`
  } else if (int >= 1e6) {
    return `${(int / 1e6).toFixed(1)}M`
  } else if (int >= 1e3) {
    return `${(int / 1e3).toFixed(1)}K`
  } else if (int <= -1e3) {
    return `${(int / 1e3).toFixed(1)}K`
  } else if (int <= -1e6) {
    return `${(int / 1e6).toFixed(1)}M`
  } else if (int <= -1e9) {
    return `${(int / 1e9).toFixed(1)}B`
  }
  return `${int}`
}
export const serialize = (cacheData: UtxoCache | PostMetaCache) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  JSON.stringify(Array.from(cacheData.entries() as any))
export const deserialize = (storeData: string) => {
  return new Map(JSON.parse(storeData)) as UtxoCache | PostMetaCache
}
export const newInstance = async (
  runtimeId: string,
): Promise<ExtensionInstance> => {
  const difficulty = 4
  const leadingZeroes = String().padStart(difficulty, '0')
  let nonce = 0
  let instanceId = ''
  let checkpointTime = Date.now()
  const startTime = Date.now()
  while (true) {
    const data = Buffer.from(`${runtimeId}:${startTime}:${nonce}`)
    const computed = await crypto.subtle.digest('SHA-256', data)
    instanceId = Buffer.from(computed).toString('hex')
    if (instanceId.substring(0, difficulty) == leadingZeroes) {
      console.log('mined instance id', instanceId, nonce, startTime)
      break
    }
    const now = Date.now()
    if (now - checkpointTime >= 10_000) {
      const hashrate = (nonce / ((now - startTime) / 1_000)).toFixed(3)
      console.log(`hashrate: ${hashrate}H/s`)
      checkpointTime = now
    }
    nonce++
  }
  return {
    instanceId,
    createdAt: new Date().toISOString(),
    runtimeId,
    startTime: startTime.toString(),
    nonce,
    registered: false,
  }
}
/**
 * Fetch data from a URL with GET method using the provided authorization header
 * @param url - The URL to fetch data from
 * @param header - The authorization header to use
 * @returns The response from the URL
 */
export async function authorizedFetch(
  url: string,
  headers: Record<'Authorization', AuthorizationHeader>,
) {
  const response = await fetch(url, { headers, method: 'GET' })
  // throw the response headers if the request is unauthorized
  if (!response.ok) {
    throw response.headers
  }
  return response.json()
}
