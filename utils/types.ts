/**
 * Copyright 2025-2026 The Lotusia Stewardship
 * Github: https://github.com/LotusiaStewardship
 * License: MIT
 */
import type { MinerGpuPreference } from '@/entrypoints/background/stores'
/**
 * Interface for mutator classes that process various types of Twitter DOM elements.
 * Each method is responsible for handling a specific type of element mutation,
 * such as posts, notifications, conversations, profile popups, and UI components.
 * Implementations may mutate the DOM, update caches, or trigger UI changes.
 */
export interface Mutator {
  /**
   * Processes a post element, e.g., timeline or feed post.
   * May parse post data, hide ads, or trigger post-specific UI changes.
   * @param element - The jQuery-wrapped post element to process.
   */
  processPost(element: JQuery<HTMLElement>): Promise<void>

  /**
   * Processes a notification element, e.g., notification timeline entry.
   * May update avatar badges or handle notification-specific UI.
   * @param element - The jQuery-wrapped notification element to process.
   */
  processNotification(element: JQuery<HTMLElement>): Promise<void>

  /**
   * Processes a conversation element, e.g., direct message thread.
   * May update avatars or handle message-specific UI.
   * @param element - The jQuery-wrapped conversation element to process.
   */
  processConversation(element: JQuery<HTMLElement>): Promise<void>

  /**
   * Processes a profile popup element, e.g., hovercard or profile preview.
   * May update avatar badges or hide unwanted UI components.
   * @param element - The jQuery-wrapped profile popup element to process.
   */
  processProfilePopup(element: JQuery<HTMLElement>): Promise<void>

  /**
   * Processes a primary column element, e.g., main content column on profile pages.
   * May update profile badges, hide buttons, or perform column-specific mutations.
   * @param element - The jQuery-wrapped primary column element to process.
   */
  processPrimaryColumn(element: JQuery<HTMLElement>): Promise<void>

  /**
   * Processes a button row element, e.g., row of action buttons under a post.
   * May insert or update custom vote buttons and handle button row mutations.
   * @param element - The jQuery-wrapped button row element to process.
   */
  processButtonRows(element: JQuery<HTMLElement>): Promise<void>

  /**
   * Processes a button element, e.g., Grok or profile summary buttons.
   * May hide or mutate specific buttons within the element.
   * @param element - The jQuery-wrapped button element to process.
   */
  processButtons(element: JQuery<HTMLElement>): Promise<void>

  /**
   * Processes an avatar element in a conversation context, e.g., message avatars.
   * May update avatar badges for message participants.
   * @param element - The jQuery-wrapped avatar conversation element to process.
   */
  processAvatarConversation(element: JQuery<HTMLElement>): Promise<void>

  /**
   * Processes avatar elements, e.g., user profile images.
   * May set or update reputation badge classes on avatars.
   * @param element - The jQuery-wrapped avatar element(s) to process.
   */
  processAvatars(element: JQuery<HTMLElement>): Promise<void>

  /**
   * Processes a profile stats element, e.g., followers/following row on profile pages.
   * May insert or update ranking/vote stats in the profile stats row.
   * @param element - The jQuery-wrapped profile stats element to process.
   */
  processProfileStats(element: JQuery<HTMLElement>): Promise<void>

  /**
   * Processes Grok-related UI elements, e.g., Grok scroll lists or drawers.
   * May hide or mutate Grok UI components within the element.
   * @param element - The jQuery-wrapped Grok elements to process.
   */
  processGrokElements(element: JQuery<HTMLElement>): Promise<void>
}

// ==================================================
// WebGPU
// ==================================================

/**
 * Initialization options for {@link WebGpuMiner}.
 */
export type MinerInitParams = {
  /** WGSL source code for the compute kernel (`search` entrypoint required). */
  shaderCode?: string
  /** Ordered adapter preference list tried during adapter discovery. */
  gpuPreferences?: Array<'high-performance' | 'low-power'>
  /** OpenCL-style ITERATIONS override constant. */
  iterations?: number
  /** Must match `@workgroup_size` in the shader. */
  workgroupSize?: number
  /** Output storage u32 length. Minimum 129 (`output[0x80]` found flag + nonce slots). */
  outputU32Length?: number
}

/** One GPU dispatch request. */
export type MinerJob = {
  /** First nonce offset for this dispatch. */
  offset: number
  /** Number of candidate nonces requested for this dispatch. */
  nonceCount: number
}

/**
 * GPU dispatch result payload.
 */
export type MinerRunTelemetry = {
  /** Workgroups dispatched along X dimension for this batch. */
  dispatchX: number
  /** Requested nonce coverage for this batch. */
  nonceCount: number
  /** CPU time spent preparing params/output uploads and command recording. */
  hostEncodeMs: number
  /** Time from queue submit until readback buffer became mappable. */
  submitToReadbackMs: number
  /** Time to copy mapped bytes into reusable CPU scratch + unmap. */
  readbackCopyMs: number
  /** CPU time spent scanning output buffer for candidate slots. */
  parseMs: number
  /** End-to-end wall-clock time for `run()`. */
  totalMs: number
}

export type MinerBatchResult = {
  /** True when kernel set output[0] == 1. */
  found: boolean
  /** First non-zero candidate low 32-bit nonce word (kernel-endian) from nonce slots. */
  nonceLow: number
  /** Full output buffer snapshot from GPU readback. */
  raw: Uint32Array
  /** Per-dispatch runtime timings for bottleneck analysis. */
  telemetry: MinerRunTelemetry
}

/**
 * Staged WebGPU capability diagnostics captured during miner initialization.
 */
export type WebGpuDiagnostics = {
  /** WebGPU API is exposed in this runtime (`navigator.gpu`). */
  apiAvailable: boolean
  /** A GPU adapter was discovered for the requested power preferences. */
  adapterAvailable: boolean
  /** Logical GPU device creation succeeded. */
  deviceReady: boolean
  /** Compute pipeline compilation/linking succeeded. */
  pipelineReady: boolean
  /** Last initialization-stage WebGPU error, if any. */
  lastError: string
}

// ==================================================
// Lotus Miner Service
// ==================================================
/**
 * High-level settings used to run the mining service.
 */
export type LotusMiningSettings = {
  /** Lotus payout address used with `getrawunsolvedblock`. */
  mineToAddress: string
  /** RPC connectivity/authentication details. */
  rpc: LotusRpcSettings
  /** Optional GPU adapter preference order. */
  gpuPreferences?: MinerGpuPreference[]
  /** Poll interval for fetching fresh block templates. */
  rpcPollIntervalMs?: number
  /** Kernel iterations override. */
  iterations?: number
  /** Reference miner kernel size equivalent. */
  kernelSize?: number
  /** Window used for periodic hashrate logs. */
  hashrateWindowMs?: number
  /** Enable verbose per-window telemetry logs for bottleneck analysis. */
  telemetryEnabled?: boolean
  /** Window for telemetry aggregation + reporting. */
  telemetryWindowMs?: number
}

/**
 * Runtime mining metrics snapshot.
 */
export type MiningStats = {
  /** Current estimated hashes/nonces per second. */
  hashrate: number
  /** Total tested nonces during current accounting window. */
  testedNonces: bigint
}

/**
 * In-memory work packet currently being mined.
 */
type Work = {
  /** 160-byte mutable header (nonce bytes are mutated in place). */
  header: Uint8Array
  /** Block body appended unchanged when submitting solved block. */
  body: Uint8Array
  /** Little-endian 256-bit target threshold. */
  target: Uint8Array
  /** Cached SHA-256(tx-layer) for header bytes [52..160] (constant per template). */
  txLayerHash: Uint8Array
  /** Monotonic dispatch counter within the current template. */
  nonceIdx: number
}

/** Public alias for active mining work payload. */
export type MiningWork = Work
