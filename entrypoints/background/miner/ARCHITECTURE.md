# WebGPU Miner Architecture (Background + Offscreen + Worker)

This document explains how the mining implementation under `entrypoints/background/miner/` works end-to-end, including all extension runtime boundaries.

## Scope

Primary code:

- `entrypoints/background/miner/**`

Associated runtime entrypoints:

- `entrypoints/background/index.ts` (control from background service worker)
- `entrypoints/offscreen-miner/main.ts` (offscreen document control plane)
- `entrypoints/offscreen-miner-worker.ts` (dedicated worker running the mining loop)

---

## Why this is split across 3 runtimes

Chrome extension service workers are not ideal for long-lived, compute-heavy GPU work. This implementation separates concerns:

1. **Background service worker**
   - Owns extension state, messaging, and UI integration.
   - Starts/stops/configures miner via `OffscreenMinerController`.

2. **Offscreen document**
   - Hosts a persistent DOM-capable extension context.
   - Owns control-plane messaging and lifecycle for a dedicated worker.

3. **Dedicated worker (offscreen miner worker)**
   - Runs `LotusMiningService` and `WebGpuMiner`.
   - Executes polling, hashing, WebGPU dispatch, candidate verification, and submission.

This keeps the UI/control-plane stable while isolating compute-heavy mining work.

---

## High-level flow

```text
Popup/UI
  -> background messaging (minerMessaging)
    -> OffscreenMinerController (background)
      -> offscreen document (OFFSCREEN_MINER_CHANNEL)
        -> dedicated worker (OFFSCREEN_WORKER_CHANNEL)
          -> LotusMiningService
            -> LotusRpcClient (getrawunsolvedblock / submitblock)
            -> WebGpuMiner (WGSL kernel dispatch)
```

Status/events flow back in reverse to update `minerStore`.

---

## Module map

## 1) Control protocol and orchestration

- `offscreen-protocol.ts`
  - Background <-> offscreen document protocol.
  - Defines command/response/event envelopes and status mapping helpers.

- `offscreen-worker-protocol.ts`
  - Offscreen document <-> worker protocol.
  - Similar envelope model for worker commands/events.

- `offscreen-controller.ts`
  - Background-side facade for:
    - ensuring offscreen document exists,
    - sending commands,
    - receiving status/error events,
    - shutdown logic.

## 2) Mining core + GPU + network

- `service/lotus-mining-service.ts`
  - Top-level mining loop orchestration.
  - Polls templates, mutates nonces, dispatches GPU work, validates candidates, submits solved blocks.

- `gpu/webgpu-miner.ts`
  - Low-level GPU resource owner and dispatch runner.
  - Manages shader pipeline, buffers, bind groups, and output readback.

- `gpu/lotus-og-kernel.ts`
  - Embedded WGSL kernel string, ported from `lotus-gpu-miner` reference kernel behavior.

- `network/rpc.ts`
  - Minimal JSON-RPC client for Lotus node interactions.

## 3) Data shaping and utilities

- `core/block.ts`
  - Parses RPC unsolved block payload into header/body/target components.

- `core/sha256.ts`
  - SHA-256 helper + Lotus hash reproduction for CPU-side candidate verification.

- `core/hex.ts`
  - Hex/byte conversion helpers.

- `constants.ts`
  - Shared host-side constants used for buffer sizes, indices, and defaults.

---

## Detailed runtime lifecycle

## A. Background service worker

Entry integration in `entrypoints/background/index.ts`:

- Creates `OffscreenMinerController`.
- Maps persisted config (`MinerConfig`) into runtime settings via `mapConfigToMiningSettings`.
- Handles start/stop/save/load commands from popup.
- Persists status updates to `minerStore`.

Important: background runtime **does not** perform GPU mining directly.

## B. Offscreen document

`entrypoints/offscreen-miner/main.ts`:

- Receives control commands (`start`, `stop`, `getStatus`, etc.) from background.
- Ensures a dedicated worker exists (`ensureWorker`).
- Forwards worker events as background events.
- Maintains cached `latestStatus` and optional settings rehydration if worker restarts.

## C. Dedicated worker

`entrypoints/offscreen-miner-worker.ts`:

- Owns one `LotusMiningService` instance.
- Handles worker commands:
  - `start`: recreate service with provided settings and begin mining.
  - `stop`/`shutdown`: stop service and clear timer.
  - `getStatus`/`ping`: return normalized status.
- Emits periodic status events every second.

---

## Mining algorithm flow (LotusMiningService)

Within `service/lotus-mining-service.ts`:

1. **Start**
   - Initialize `WebGpuMiner` with preferences + iteration settings.
   - Fetch initial unsolved block template.
   - Begin periodic polling for newer templates.
   - Spawn async mining loop (`while (running) mineSomeNonces()`).

2. **Template update**
   - `getrawunsolvedblock(mineToAddress)` via RPC.
   - Parse into `LotusBlock`:
     - `header` (160 bytes),
     - `body` (remaining bytes),
     - `target` (little-endian bytes).
   - Detect chain tip switch using prev-hash.

3. **Nonce search batch**
   - Determine effective nonces per search from:
     - `kernelSize * iterations`, clamped by GPU device dispatch capacity.
   - Generate random 64-bit nonce base (`randomU64`) and write to header bytes `44..51`.
   - Build partial header payload (84 bytes / 21 words):
     - first 52 bytes of header,
     - SHA-256 of tx-layer bytes (`header[52..160]`).
   - Upload target + partial header to `WebGpuMiner`.
   - Dispatch kernel and read output.

4. **Candidate handling**
   - Kernel returns `found` flag + low nonce word.
   - Reconstruct candidate nonce and write back into header.
   - Compute full `lotusHash` on CPU.
   - Compare hash vs full target on CPU.
   - If valid, serialize solved block and call `submitblock`.

5. **Stats + logging**
   - Tracks tested nonces and reports hashrate over configurable window.
   - Exposes `getStats()`, `isRunning`, and `lastError`.

---

## GPU contract details

`gpu/webgpu-miner.ts` + `gpu/lotus-og-kernel.ts` must stay aligned.

### Buffers

- `params` (uniform, 4 x u32)
  - `offset`, `target0`, `target1`, `target2`

- `partial_header` (storage, 21 x u32)
  - Precomputed input payload matching kernel expectations.

- `output` (storage, >= 2 x u32)
  - `output[0]`: found flag
  - `output[1]`: candidate nonce low word

### Dispatch model

- Kernel workgroup size must match host constant (`DEFAULT_WORKGROUP_SIZE`).
- `ITERATIONS` is provided as a pipeline override constant.
- Effective nonce coverage per dispatch:
  - `dispatchX * workgroupSize * iterations`

### Validation model

- Kernel uses a fast pre-filter (`hash[7] == 0`) for candidate detection.
- Host performs full target check before submission.

This mirrors reference miner behavior and avoids false positives being submitted.

---

## Endianness and nonce handling

Critical byte-order behaviors:

- RPC target arrives big-endian hex, then converted to little-endian bytes for mining flow.
- Header nonce words are written little-endian at offsets `44` (low) and `48` (high).
- GPU output nonce low word requires `swapU32` before reconstruction.
- Full hash vs target comparison is performed as little-endian 256-bit values.

When modifying serialization/hashing code, treat endianness as protocol-critical.

---

## Configuration and defaults

Shared defaults are in `constants.ts`:

- `DEFAULT_ITERATIONS`
- `DEFAULT_WORKGROUP_SIZE`
- `DEFAULT_RPC_POLL_MS`
- `DEFAULT_HASHRATE_WINDOW_MS`
- `DEFAULT_KERNEL_SIZE`

User config is translated via `mapConfigToMiningSettings`.

---

## Error handling strategy

- Worker/service errors are caught and converted to `lastError` status.
- Offscreen layers propagate both:
  - synchronous command failures (response `ok: false`), and
  - async `'error'` events.
- Background uses these updates to keep store/UI state accurate.

Best-effort shutdown is used to avoid hanging extension contexts.

---

## Extending safely

If you change one layer, verify adjacent contracts:

1. **Protocol changes**
   - Update both sender and receiver types/guards for command/event envelopes.

2. **Kernel/host layout changes**
   - Keep WGSL struct layouts and host buffer writes perfectly in sync.
   - Re-check constants and byte/word lengths.

3. **Hash/serialization changes**
   - Validate against Lotus reference behavior.
   - Re-test endianness-sensitive paths (nonce, target, hash compare).

4. **Runtime changes**
   - Ensure offscreen creation/teardown remains race-safe.
   - Preserve periodic status emissions to keep UI responsive.

---

## Suggested verification checklist

After miner changes:

- `npm run compile`
- Start miner from popup and confirm:
  - offscreen document is created,
  - worker starts,
  - status updates stream every second,
  - hashrate is non-zero,
  - stop/shutdown fully releases runtime.
- Validate error path by intentionally breaking RPC credentials and confirming `lastError` propagation.

---

## Quick file index

- Constants: `entrypoints/background/miner/constants.ts`
- Types barrel: `entrypoints/background/miner/types.ts`
- Core utils: `entrypoints/background/miner/core/*`
- GPU runtime: `entrypoints/background/miner/gpu/*`
- Network RPC: `entrypoints/background/miner/network/*`
- Service orchestrator: `entrypoints/background/miner/service/*`
- Offscreen protocols/controller: `entrypoints/background/miner/offscreen-*.ts`
- Offscreen entrypoint: `entrypoints/offscreen-miner/main.ts`
- Worker entrypoint: `entrypoints/offscreen-miner-worker.ts`
