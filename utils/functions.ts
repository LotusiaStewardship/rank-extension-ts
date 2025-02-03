import type { UtxoCache } from '@/entrypoints/background/modules/wallet'

export const toXPI = (sats: string) =>
  (Number(sats) / 1_000_000).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  })
export const serialize = (cacheData: UtxoCache) =>
  JSON.stringify(Array.from(cacheData.entries()))
export const deserialize = (storeData: string) => {
  return new Map(JSON.parse(storeData)) as UtxoCache
}
