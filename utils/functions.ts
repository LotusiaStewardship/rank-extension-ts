import type { UtxoCache } from '@/entrypoints/background/modules/wallet'

export const toXPI = (sats: string) =>
  (Number(sats) / 1_000_000).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  })
export const toMinifiedNumber = (number: number) => {
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
export const serialize = (cacheData: UtxoCache) =>
  JSON.stringify(Array.from(cacheData.entries()))
export const deserialize = (storeData: string) => {
  return new Map(JSON.parse(storeData)) as UtxoCache
}
