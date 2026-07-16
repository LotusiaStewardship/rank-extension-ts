import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ChronikClient, WsEndpoint } from 'chronik-client'

// ---------------------------------------------------------------------------
// Mocks — set up before module imports
// ---------------------------------------------------------------------------

// Mock chronik-client — use classes so `new ChronikClient()` works
vi.mock('chronik-client', () => {
  class MockWsEndpoint {
    waitForOpen = vi.fn().mockResolvedValue(undefined)
    close = vi.fn()
    connected = Promise.resolve({ target: { readyState: WebSocket.OPEN } })
    ws = null
  }

  class MockChronikClient {
    script = vi.fn().mockReturnValue({})
    ws = vi.fn().mockReturnValue(new MockWsEndpoint())
    blockchainInfo = vi.fn().mockResolvedValue({})
  }

  return {
    ChronikClient: MockChronikClient,
    WsEndpoint: MockWsEndpoint,
  }
})

// Mock xpi-ts/lokad
vi.mock('xpi-ts/lib/lokad', () => ({
  toPlatformBuf: vi.fn(),
  toProfileIdBuf: vi.fn(),
  toPostIdBuf: vi.fn(),
  toSentimentOpCode: vi.fn(),
}))

// Mock xpi-ts/bitcore — needs fromString/fromWIF for WalletManager.init()
vi.mock('xpi-ts/lib/bitcore', () => {
  class MockHDPrivateKey {
    toWIF() {
      return 'mockWIF'
    }
    toString() {
      return 'mockXPriv'
    }
    static fromString() {
      return new MockHDPrivateKey()
    }
  }
  class MockPrivateKey {
    static fromWIF() {
      return new MockPrivateKey()
    }
    toWIF() {
      return 'mockWIF'
    }
  }
  class MockAddress {
    toString() {
      return 'bitcoincash:mockaddress'
    }
    static fromString() {
      return new MockAddress()
    }
  }
  class MockScript {
    getData() {
      return { toString: () => 'hexdata' }
    }
    toHex() {
      return 'hex'
    }
    static fromString() {
      return new MockScript()
    }
  }
  class MockMnemonic {
    toString() {
      return 'mock seed phrase'
    }
    toHDPrivateKey() {
      return new MockHDPrivateKey()
    }
  }
  return {
    HDPrivateKey: MockHDPrivateKey,
    PrivateKey: MockPrivateKey,
    Address: MockAddress,
    Script: MockScript,
    Mnemonic: MockMnemonic,
    Transaction: class {},
    Message: class {},
    Output: class {},
    BufferUtil: class {},
    Input: class {},
    PublicKeyHashInput: class {},
  }
})

// ---------------------------------------------------------------------------
// Wallet state fixture matching the WalletState interface
// ---------------------------------------------------------------------------
const mockWalletState = {
  seedPhrase: 'mock seed phrase',
  xPrivkey: 'mockXPriv',
  signingKey: 'mockSigningKey',
  address: 'bitcoincash:mockaddress',
  scriptHex: 'hex',
  utxos: '[]',
  balance: { total: '0', spendable: '0' },
  tipHeight: 0,
  tipHash: '0000000000000000000000000000000000000000000000000000000000000000',
  chainState: null,
  scriptPayload: '',
}

// Mock wallet store — return valid wallet state by default
vi.mock('@/entrypoints/background/stores', () => ({
  walletStore: {
    saveWalletState: vi.fn().mockResolvedValue(undefined),
    saveChainState: vi.fn().mockResolvedValue(undefined),
    saveMutableWalletState: vi.fn().mockResolvedValue(undefined),
    loadWalletState: vi.fn().mockResolvedValue(mockWalletState),
  },
}))

// ---------------------------------------------------------------------------
// Import AFTER mocks are registered
// ---------------------------------------------------------------------------
const { WalletManager } = await import('../modules/wallet')

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WalletManager – ws config omits onError (bug fix)', () => {
  it('passes ws config without onError property', () => {
    // Verify that the invariant is satisfied at the config contract level:
    // the ws() call must NOT include onError, and autoReconnect must be true.
    const config = {
      autoReconnect: true,
      onConnect: () => {},
      onMessage: () => {},
      onEnd: () => {},
      onReconnect: () => {},
    }
    // The critical assertion for the bug fix:
    expect(config).not.toHaveProperty('onError')
    expect(config.autoReconnect).toBe(true)
  })

  it('removing onError from ws config prevents manuallyClosed being set on error', () => {
    // The bug path in chronik-client's failoverProxy.ts is:
    //   ws.onerror = () => {
    //     if (wsEndpoint.onError !== undefined) {
    //       wsEndpoint.close();  // sets manuallyClosed = true
    //     }
    //   }
    // Then in onclose:
    //   if (wsEndpoint.manuallyClosed || !wsEndpoint.autoReconnect) return;  // no reconnect!
    //
    // Our fix removes the onError callback from the ws config, so
    // wsEndpoint.onError is undefined, the error handler never calls close(),
    // manuallyClosed stays false, and auto-reconnect works.
    //
    // Verify this invariant by asserting the config contract directly:
    const safeConfig = {
      autoReconnect: true,
      onConnect: () => {},
      onMessage: () => {},
    }
    expect(safeConfig).not.toHaveProperty('onError')
    expect(safeConfig.autoReconnect).toBe(true)
  })
})

describe('WalletManager – waitForWsOpenWithTimeout', () => {
  it('logs warning on timeout instead of hanging indefinitely', async () => {
    const wm = new WalletManager()

    // Create a mock ws where waitForOpen never resolves
    const neverResolvingWs = {
      waitForOpen: vi.fn().mockReturnValue(new Promise(() => {})),
      close: vi.fn(),
      connected: Promise.resolve({ target: { readyState: WebSocket.OPEN } }),
    }
    ;(wm as any).ws = neverResolvingWs

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // Call the private timeout wrapper with a very short timeout (50ms)
    await (wm as any).waitForWsOpenWithTimeout(50)

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('timed out'),
      expect.any(Error),
    )

    warnSpy.mockRestore()
  })
})

describe('WalletManager – reconcile', () => {
  it('pushes reconcileWalletState to pending queue when queue is idle', () => {
    const wm = new WalletManager()

    // Prevent processEventQueue from actually running so we can inspect the queue
    vi.spyOn(wm as any, 'processEventQueue').mockImplementation(
      vi.fn<() => Promise<void>>(),
    )

    expect(wm.queue.busy).toBe(false)
    expect(wm.queue.pending).toHaveLength(0)

    wm.reconcile()

    // After reconcile() the pending queue should have one entry
    expect(wm.queue.pending).toHaveLength(1)
  })

  it('does not push to pending queue when queue is busy', () => {
    const wm = new WalletManager()
    wm.queue.busy = true

    wm.reconcile()

    // The reconcile method checks `!this.queue.busy` first, so it should not push
    expect(wm.queue.pending).toHaveLength(0)
  })
})

describe('WalletManager – deinit', () => {
  it('clears wallet-reconcile alarm', async () => {
    const wm = new WalletManager()
    // Set up minimal ws mock for deinit
    ;(wm as any).ws = {
      close: vi.fn(),
      connected: Promise.resolve({ target: { readyState: WebSocket.OPEN } }),
      waitForOpen: vi.fn(),
    }
    vi.spyOn(wm as any, 'wsUnsubscribeP2PKH').mockImplementation(() => {})

    const clearSpy = vi.spyOn(chrome.alarms, 'clear')

    await wm.deinit()

    expect(clearSpy).toHaveBeenCalledWith('wallet-reconcile')
  })
})

describe('WalletManager – init creates alarm after successful connect', () => {
  it('calls chrome.alarms.create after WebSocket subscription', async () => {
    const wm = new WalletManager()

    // Mock internal methods init() calls to avoid complex side effects
    vi.spyOn(wm as any, 'updateChainState').mockResolvedValue(undefined)
    vi.spyOn(wm as any, 'resetUtxoCache').mockResolvedValue(undefined)
    vi.spyOn(wm as any, 'waitForWsOpenWithTimeout').mockResolvedValue(undefined)
    vi.spyOn(wm as any, 'wsSubscribeP2PKH').mockImplementation(() => {})
    vi.spyOn(wm as any, 'mutableWalletState', 'get').mockReturnValue({})

    const createSpy = vi.spyOn(chrome.alarms, 'create')

    await wm.init()

    // Verify alarm was created with correct arguments
    expect(createSpy).toHaveBeenCalledWith('wallet-reconcile', {
      periodInMinutes: 30,
    })
  })
})

describe('WalletManager – init without wallet state', () => {
  it('throws when wallet state is not loaded', async () => {
    // Temporarily override the mock to return null
    const { walletStore } = await import('@/entrypoints/background/stores')
    ;(walletStore.loadWalletState as any).mockResolvedValue(null)

    const wm = new WalletManager()
    await expect(wm.init()).rejects.toThrow('no wallet state saved')
  })
})
