import type { UtxoCache } from '@/entrypoints/background/modules/wallet'
import type { PostMetaCache } from '@/entrypoints/background/stores'

export const toXPI = (sats: string) =>
  (Number(sats) / 1_000_000).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  })
export const toMinifiedNumber = (number: number, divisor: number = 1) => {
  number = Math.floor(number / divisor)
  if (number > 1e9) {
    return `${(number / 1e9).toFixed(1)}B`
  } else if (number > 1e6) {
    return `${(number / 1e6).toFixed(1)}M`
  } else if (number > 1e3) {
    return `${(number / 1e3).toFixed(1)}K`
  } else if (number < -1e3) {
    return `${(number / 1e3).toFixed(1)}K`
  } else if (number < -1e6) {
    return `${(number / 1e6).toFixed(1)}M`
  } else if (number < -1e9) {
    return `${(number / 1e9).toFixed(1)}B`
  }
  return `${number}`
}
export const serialize = (cacheData: UtxoCache | PostMetaCache) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  JSON.stringify(Array.from(cacheData.entries() as any))
export const deserialize = (storeData: string) => {
  return new Map(JSON.parse(storeData)) as UtxoCache | PostMetaCache
}
export const newInstanceId = async (runtimeId: string) => {
  const difficulty = 1
  const leadingZeroes = String().padStart(difficulty, '0')
  let nonce = 0
  let hash = ''
  let checkpointTime = Date.now()
  const startTime = Date.now()
  //console.log('mining for instanceId at', new Date(startTime).toISOString())
  while (true) {
    const data = Buffer.from(`${runtimeId}:${startTime}:${nonce}`)
    const computed = await crypto.subtle.digest('SHA-256', data)
    hash = Buffer.from(computed).toString('hex')
    if (hash.substring(0, difficulty) == leadingZeroes) {
      console.log('mined instance id', hash, nonce, startTime)
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
  return hash
}
