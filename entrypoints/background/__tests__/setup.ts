import { vi } from 'vitest'

// Chrome API stubs for unit testing
globalThis.chrome = {
  alarms: {
    create: vi.fn(),
    clear: vi.fn(),
    onAlarm: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
      hasListener: vi.fn(),
    },
  },
  runtime: {
    onStartup: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
      hasListener: vi.fn(),
    },
  },
} as any

// deserialize and WALLET_CHRONIK_URL are used in wallet.ts without explicit imports
// (resolved via WXT/Vite build system). Provide them globally for the test environment.
;(globalThis as any).deserialize = (storeData: string) => {
  return new Map(JSON.parse(storeData))
}
;(globalThis as any).WALLET_CHRONIK_URL = 'https://chronik.mock'
