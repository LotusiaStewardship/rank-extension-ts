# WebGPU Miner Architecture (Background + Offscreen + Worker)

This document describes the **current** mining architecture in `rank-extension-ts`.

> Updated to match the architecture introduced in commit `21e89ab` and current file layout.

## Runtime split

Mining is intentionally split across three extension runtimes:

1. **Background service worker** (`entrypoints/background/index.ts`)
   - Handles popup messaging (`minerMessaging`)
   - Persists config/status in `minerStore`
   - Controls miner lifecycle through `OffscreenMinerController`

2. **Offscreen document** (`entrypoints/offscreen-miner/main.ts`)
   - Receives background commands over `OFFSCREEN_MINER_CHANNEL`
   - Owns lifecycle of one dedicated worker (`/offscreen-miner-worker.js`)
   - Forwards worker status/error events back to background

3. **Dedicated worker** (`entrypoints/offscreen-miner-worker.ts`)
   - Owns `LotusMiningService`
   - Runs mining loop + WebGPU execution
   - Emits status every second over `OFFSCREEN_WORKER_CHANNEL`

This avoids running long-lived compute work directly in the background service worker.

---

## High-level message flow

```text
Popup/UI
  -> minerMessaging (background)
    -> OffscreenMinerController
      -> offscreen document (OFFSCREEN_MINER_CHANNEL)
        -> worker (OFFSCREEN_WORKER_CHANNEL)
          -> LotusMiningService
            -> LotusRpcClient (getrawunsolvedblock / submitblock)
            -> WebGpuMiner (WGSL dispatch)
```

Status and errors propagate in reverse, and background persists status in `minerStore`.

---

## Current file map

### Background control plane

- `entrypoints/background/modules/offscreen-controller.ts`
  - Ensures/creates offscreen document (`browser.offscreen.createDocument`)
  - Sends commands (`start`, `stop`, `getStatus`, `updateConfig`, `shutdown`, `ping`)
  - Handles async offscreen events (`status`, `error`)

- `entrypoints/background/index.ts`
  - Receives popup miner messages
  - Maps `MinerConfig` -> `LotusMiningSettings` via `mapConfigToMiningSettings`
  - Starts/stops/updates miner through controller
  - Polls status every second and stores in `minerStore`

- `entrypoints/background/stores/miner.ts`
  - Persistent miner config/status storage

### Offscreen runtime

- `entrypoints/offscreen-miner/main.ts`
  - Background-facing command handler
  - Worker request/response bridge with timeout handling
  - Caches `latestStatus`
  - Rehydrates worker with last settings if worker is recreated

- `entrypoints/offscreen-miner-worker.ts`
  - Worker command handler (`start/stop/getStatus/shutdown/ping`)
  - Recreates mining service on `start`
  - Emits periodic status events

### Mining implementation

- `entrypoints/offscreen-miner/service.ts` (`LotusMiningService`)
  - Fetches templates (`getrawunsolvedblock`)
  - Builds partial header payload for kernel
  - Runs nonce search batches on GPU
  - CPU-verifies candidates (`lotusHash`, full target compare)
  - Submits solved blocks (`submitblock`)

- `entrypoints/offscreen-miner/webgpu-miner.ts` (`WebGpuMiner`)
  - Owns GPU adapter/device/pipeline/buffers
  - Uploads params, target, partial header
  - Dispatches WGSL kernel and reads back result

- `entrypoints/offscreen-miner/rpc.ts` (`LotusRpcClient`)
  - Minimal JSON-RPC client for Lotus daemon auth + calls

### Shared miner utilities/types (moved under `utils/`)

- `utils/protocols.ts`
  - `OFFSCREEN_MINER_CHANNEL`, `OFFSCREEN_WORKER_CHANNEL`
  - Command/response/event types
  - `createDefaultMinerStatus`, `mapConfigToMiningSettings`

- `utils/constants.ts`
  - `MINER_DEFAULTS` (iterations, workgroup size, polling windows, buffer lengths, etc.)

- `utils/types.ts`
  - `LotusMiningSettings`, `MiningStats`, `MinerInitParams`, and related miner types

- `utils/miner-core-block.ts`
  - `createBlock`, `prevHash`

- `utils/miner-core-sha256.ts`
  - `sha256`, `lotusHash`

- `utils/miner-core-hex.ts`
  - `hexToBytes`, `bytesToHex`, `reverseBytes`

- `utils/lotus-og-kernel.ts`
  - Embedded WGSL kernel string (`LOTUS_OG_WGSL`)

---

## Mining loop summary (`LotusMiningService`)

1. Initialize `WebGpuMiner`
2. Fetch initial unsolved block + target
3. Poll RPC for refreshed templates on interval
4. For each batch:
   - Set randomized 64-bit nonce high/low words in header (`44..51`, little-endian)
   - Build 84-byte partial header (first 52 bytes + SHA-256 of bytes `52..160`)
   - Run GPU search (`kernelSize * iterations`, clamped by device limits)
5. If kernel reports candidate:
   - Reconstruct nonce
   - Compute full `lotusHash` on CPU
   - Compare hash vs full target
   - Submit solved block hex via RPC

---

## GPU host/kernel contract

`WebGpuMiner` and `LOTUS_OG_WGSL` must stay in sync.

Buffers:
- `params` (uniform, 4 u32): `offset`, `target0`, `target1`, `target2`
- `partial_header` (storage, 21 u32)
- `output` (storage, at least 129 u32): nonce slots `output[0..0x7f]`, found flag `output[0x80]`

Dispatch:
- Shader workgroup size is `256` (`@workgroup_size(256)`)
- `ITERATIONS` is provided as a pipeline constant override
- Effective coverage: `dispatchX * workgroupSize * iterations`

Kernel filtering:
- Kernel uses prefilter (`hash[7] == 0`)
- Host performs full target validation before submission

---

## Endianness-critical behaviors

- RPC target arrives big-endian hex, converted to little-endian bytes for mining
- Header nonce is written little-endian at offsets 44 (low) and 48 (high)
- Kernel-returned nonce low word is byte-swapped before recomposition (`swapU32`)
- CPU hash/target comparison is done as little-endian 256-bit values

Any hash/serialization changes should be treated as protocol-sensitive.

---

## Operational notes

- `updateConfig` stores new settings and only restarts worker mining if currently running
- `shutdown` stops worker and closes offscreen document (best effort)
- Background also runs a 1s status polling loop, in addition to async event updates
- Default config/status values are stored in `entrypoints/background/stores/miner.ts`

---

## Quick verification checklist

- Build project (`npm run compile`)
- Start miner from popup and confirm:
  - offscreen document exists
  - worker starts
  - status updates every second
  - hashrate becomes non-zero (if RPC/node/GPU available)
- Stop miner and confirm runtime tears down cleanly
- Break RPC credentials intentionally and confirm `lastError` propagation
