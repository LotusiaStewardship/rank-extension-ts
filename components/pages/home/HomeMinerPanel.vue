<script setup lang="ts">
import { FwbButton, FwbHeading, FwbInput, FwbP } from 'flowbite-vue'
import type { ShallowRef } from 'vue'
import type {
  MinerConfig,
  MinerGpuPreference,
  MinerPowerProfile,
  MinerStatus,
} from '@/entrypoints/background/stores'
import { minerMessaging } from '@/entrypoints/background/messaging'

const walletAddress = inject(
  'wallet-address',
  shallowRef(''),
) as ShallowRef<string>

type MinerPreset = Pick<
  MinerConfig,
  'iterations' | 'kernelSize' | 'rpcPollIntervalMs' | 'hashrateWindowMs'
>

const PRESETS: Array<{
  key: MinerPowerProfile
  label: string
  helper: string
}> = [
  { key: 'low-power', label: 'Eco', helper: 'Lower throughput' },
  { key: 'balanced', label: 'Balanced', helper: 'Recommended' },
  { key: 'high-power', label: 'Turbo', helper: 'Highest throughput' },
]

const POWER_PRESETS: Record<
  Exclude<MinerPowerProfile, 'custom'>,
  MinerPreset
> = {
  'low-power': {
    iterations: 8,
    kernelSize: 1 << 12,
    rpcPollIntervalMs: 1000,
    hashrateWindowMs: 3000,
  },
  'balanced': {
    iterations: 12,
    kernelSize: 1 << 15,
    rpcPollIntervalMs: 1000,
    hashrateWindowMs: 3000,
  },
  'high-power': {
    iterations: 16,
    kernelSize: 1 << 18,
    rpcPollIntervalMs: 500,
    hashrateWindowMs: 3000,
  },
}

const defaultConfig: MinerConfig = {
  rpcUrl: 'http://127.0.0.1:10604',
  rpcUser: 'lotus',
  rpcPassword: 'lotus',
  mineToAddress: '',
  powerProfile: 'balanced',
  gpuPreferences: ['high-performance'],
  webgpuHighPerformanceLimits: null,
  webgpuProfiles: {
    'low-power': { workgroupSizePct: 0.1, workgroupSizeX: 0 },
    balanced: { workgroupSizePct: 0.35, workgroupSizeX: 0 },
    'high-power': { workgroupSizePct: 0.9, workgroupSizeX: 0 },
  },
  ...POWER_PRESETS['high-power'], // KEEP THIS PRESET AS DEFAULT
}

const loading = shallowRef(false)
const saving = shallowRef(false)
const message = shallowRef('')
const error = shallowRef('')
const showAdvanced = shallowRef(false)

const config = ref<MinerConfig>({ ...defaultConfig })
const baseline = ref<MinerConfig>({ ...defaultConfig })
const status = ref<MinerStatus>({
  running: false,
  hashrate: 0,
  testedNonces: '0',
  webgpuAvailable: false,
  webgpuAdapterAvailable: false,
  webgpuDeviceReady: false,
  webgpuPipelineReady: false,
  webgpuSupported: false,
  lastError: '',
  updatedAt: 0,
})
const refreshTimer = ref<ReturnType<typeof setInterval> | null>(null)

const isRunning = computed(() => status.value.running)
const isReady = computed(() => status.value.webgpuAvailable)
const hasRequiredConfig = computed(() => {
  return Boolean(
    config.value.rpcUrl.trim() &&
      config.value.rpcUser.trim() &&
      config.value.rpcPassword.trim() &&
      config.value.mineToAddress.trim() &&
      config.value.gpuPreferences.length,
  )
})
const hashrateLabel = computed(() =>
  (status.value.hashrate / 1_000_000).toFixed(3),
)
const noncesLabel = computed(() =>
  BigInt(status.value.testedNonces || '0').toLocaleString(),
)
const profileHint = computed(() => {
  if (config.value.powerProfile === 'custom')
    return `Custom • ${config.value.iterations} iterations`
  return (
    PRESETS.find(p => p.key === config.value.powerProfile)?.helper ??
    'Recommended'
  )
})
const dirty = computed(
  () =>
    JSON.stringify(normalized(config.value)) !==
    JSON.stringify(normalized(baseline.value)),
)
const canStart = computed(
  () =>
    !loading.value &&
    !saving.value &&
    !isRunning.value &&
    isReady.value &&
    hasRequiredConfig.value,
)

const gpuPreferences = computed({
  get: () => config.value.gpuPreferences,
  set(next: MinerGpuPreference[]) {
    config.value.gpuPreferences = [
      ...new Set(next.length ? next : ['high-performance']),
    ] as MinerGpuPreference[]
  },
})

function normalized(input: MinerConfig): MinerConfig {
  return { ...input, gpuPreferences: [...new Set(input.gpuPreferences)].sort() }
}

function fail(text: string): false {
  error.value = text
  message.value = ''
  return false
}

function validate(): boolean {
  error.value = ''
  if (!config.value.rpcUrl.trim()) return fail('RPC URL is required')
  if (!config.value.rpcUser.trim()) return fail('RPC username is required')
  if (!config.value.rpcPassword.trim()) return fail('RPC password is required')
  if (!config.value.mineToAddress.trim())
    return fail('Payout address is required')
  if (!config.value.gpuPreferences.length)
    return fail('Select a GPU preference')
  return true
}

function applyPreset(profile: MinerPowerProfile) {
  config.value.powerProfile = profile
  if (profile === 'custom') return
  Object.assign(config.value, POWER_PRESETS[profile])
}

function inferPreset() {
  const found = (
    Object.entries(POWER_PRESETS) as Array<
      [Exclude<MinerPowerProfile, 'custom'>, MinerPreset]
    >
  ).find(
    ([, preset]) =>
      preset.iterations === config.value.iterations &&
      preset.kernelSize === config.value.kernelSize &&
      preset.rpcPollIntervalMs === config.value.rpcPollIntervalMs &&
      preset.hashrateWindowMs === config.value.hashrateWindowMs,
  )
  config.value.powerProfile = found?.[0] ?? 'custom'
}

function loadDefaults() {
  if (!config.value.gpuPreferences.length)
    config.value.gpuPreferences = ['high-performance']
  if (!config.value.mineToAddress && walletAddress.value)
    config.value.mineToAddress = walletAddress.value
  inferPreset()
}

async function loadConfig() {
  loading.value = true
  try {
    config.value = await minerMessaging.sendMessage(
      'popup:minerLoadConfig',
      undefined,
    )
    loadDefaults()
    baseline.value = structuredClone(normalized(config.value))
  } catch (e) {
    error.value = `Failed to load miner settings: ${e instanceof Error ? e.message : String(e)}`
  } finally {
    loading.value = false
  }
}

async function loadStatus() {
  status.value = await minerMessaging.sendMessage(
    'popup:minerLoadStatus',
    undefined,
  )
}

async function saveConfig(): Promise<boolean> {
  if (!validate()) return false
  saving.value = true
  try {
    config.value = await minerMessaging.sendMessage(
      'popup:minerSaveConfig',
      config.value,
    )
    baseline.value = structuredClone(normalized(config.value))
    message.value = 'Saved'
    return true
  } catch (e) {
    error.value = `Failed to save settings: ${e instanceof Error ? e.message : String(e)}`
    return false
  } finally {
    saving.value = false
  }
}

async function startMiner() {
  if (!validate()) return
  if (dirty.value && !(await saveConfig())) return
  message.value = 'Starting miner…'
  status.value = await minerMessaging.sendMessage('popup:minerStart', undefined)
  message.value = status.value.running ? 'Mining started' : 'Start requested'
}

async function stopMiner() {
  message.value = 'Stopping miner…'
  status.value = await minerMessaging.sendMessage('popup:minerStop', undefined)
  message.value = 'Mining stopped'
}

function useWalletAddress() {
  if (!walletAddress.value) return
  config.value.mineToAddress = walletAddress.value
  message.value = 'Wallet address applied'
}

watch(walletAddress, next => {
  if (next && !config.value.mineToAddress) config.value.mineToAddress = next
})

watch(
  () => [
    config.value.iterations,
    config.value.kernelSize,
    config.value.rpcPollIntervalMs,
    config.value.hashrateWindowMs,
  ],
  () => {
    if (config.value.powerProfile === 'custom') {
      inferPreset()
      return
    }
    const preset =
      POWER_PRESETS[
        config.value.powerProfile as Exclude<MinerPowerProfile, 'custom'>
      ]
    if (
      config.value.iterations !== preset.iterations ||
      config.value.kernelSize !== preset.kernelSize ||
      config.value.rpcPollIntervalMs !== preset.rpcPollIntervalMs ||
      config.value.hashrateWindowMs !== preset.hashrateWindowMs
    ) {
      config.value.powerProfile = 'custom'
    }
  },
)

onMounted(async () => {
  await loadConfig()
  await loadStatus()
  refreshTimer.value = setInterval(() => {
    void loadStatus()
  }, 1000)
})

onBeforeUnmount(() => {
  if (refreshTimer.value) clearInterval(refreshTimer.value)
})
</script>

<template>
  <FwbHeading class="pb-2" color="dark:text-white" tag="h4"
    >WebGPU Miner</FwbHeading
  >
  <FwbP>Simple mining controls with a clear default setup.</FwbP>

  <div v-if="loading" class="py-4">
    <FwbP class="text-gray-500 dark:text-gray-400"
      >Loading miner settings…</FwbP
    >
  </div>

  <template v-else>
    <div class="py-3 space-y-3">
      <div class="flex items-center justify-between gap-2">
        <div>
          <div class="text-sm font-medium text-gray-900 dark:text-white">
            Status
          </div>
          <FwbP class="text-xs text-gray-500 dark:text-gray-400">
            {{
              isRunning
                ? 'Mining in progress'
                : isReady
                  ? 'Ready to start'
                  : 'Waiting for WebGPU support'
            }}
          </FwbP>
        </div>
        <span
          class="rounded px-3 py-1 text-sm font-semibold"
          :class="
            isRunning
              ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
              : isReady
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
          "
        >
          {{ isRunning ? 'Running' : isReady ? 'Ready' : 'Not ready' }}
        </span>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <div
          class="rounded-lg border border-gray-200 dark:border-gray-600 p-2 text-center"
        >
          <div class="text-xs text-gray-500 dark:text-gray-400">WebGPU</div>
          <div
            class="text-sm font-semibold"
            :class="
              status.webgpuAvailable
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400'
            "
          >
            {{ status.webgpuAvailable ? 'Available' : 'Unavailable' }}
          </div>
        </div>
        <div
          class="rounded-lg border border-gray-200 dark:border-gray-600 p-2 text-center"
        >
          <div class="text-xs text-gray-500 dark:text-gray-400">Adapter</div>
          <div
            class="text-sm font-semibold"
            :class="
              status.webgpuAdapterAvailable
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400'
            "
          >
            {{ status.webgpuAdapterAvailable ? 'Found' : 'Missing' }}
          </div>
        </div>
        <div
          class="rounded-lg border border-gray-200 dark:border-gray-600 p-2 text-center"
        >
          <div class="text-xs text-gray-500 dark:text-gray-400">Device</div>
          <div
            class="text-sm font-semibold"
            :class="
              status.webgpuDeviceReady
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400'
            "
          >
            {{ status.webgpuDeviceReady ? 'Ready' : 'Pending' }}
          </div>
        </div>
        <div
          class="rounded-lg border border-gray-200 dark:border-gray-600 p-2 text-center"
        >
          <div class="text-xs text-gray-500 dark:text-gray-400">Pipeline</div>
          <div
            class="text-sm font-semibold"
            :class="
              status.webgpuPipelineReady
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400'
            "
          >
            {{ status.webgpuPipelineReady ? 'Ready' : 'Pending' }}
          </div>
        </div>
        <div
          class="rounded-lg border border-gray-200 dark:border-gray-600 p-2 text-center"
        >
          <div class="text-xs text-gray-500 dark:text-gray-400">Miner</div>
          <div
            class="text-sm font-semibold"
            :class="
              isRunning
                ? 'text-green-600 dark:text-green-400'
                : 'text-gray-700 dark:text-gray-300'
            "
          >
            {{ isRunning ? 'Running' : 'Stopped' }}
          </div>
        </div>
      </div>

      <div class="rounded-lg border border-gray-200 dark:border-gray-600 p-3">
        <div class="flex items-end justify-between gap-3">
          <div>
            <div class="text-sm font-medium text-gray-900 dark:text-white">
              Current hashrate
            </div>
            <div class="text-xs text-gray-500 dark:text-gray-400">
              {{ profileHint }}
            </div>
          </div>
          <div class="text-right">
            <div
              class="text-3xl font-bold text-purple-600 dark:text-purple-400"
            >
              {{ hashrateLabel }} MH/s
            </div>
            <div class="text-xs text-gray-500 dark:text-gray-400">
              {{ noncesLabel }} tested nonces
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="py-3">
      <div class="flex items-center justify-between gap-2 mb-2">
        <label class="text-sm font-medium text-gray-900 dark:text-white"
          >Power profile</label
        >
        <span class="text-xs text-gray-500 dark:text-gray-400"
          >Balanced is recommended</span
        >
      </div>
      <div class="grid grid-cols-3 gap-2">
        <button
          v-for="preset in PRESETS"
          :key="preset.key"
          type="button"
          class="rounded-lg border px-3 py-2 text-left transition focus:outline-none focus:ring-2 focus:ring-purple-300 dark:focus:ring-purple-800"
          :class="
            config.powerProfile === preset.key
              ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
              : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800/60'
          "
          :aria-pressed="config.powerProfile === preset.key"
          @click="applyPreset(preset.key)"
        >
          <div class="text-sm font-medium text-gray-900 dark:text-white">
            {{ preset.label }}
          </div>
          <div class="text-xs text-gray-500 dark:text-gray-400">
            {{ preset.helper }}
          </div>
        </button>
      </div>
    </div>

    <details
      :open="showAdvanced"
      class="py-2"
      @toggle="showAdvanced = ($event.target as HTMLDetailsElement).open"
    >
      <summary
        class="cursor-pointer text-sm font-medium text-gray-900 dark:text-white"
      >
        Advanced settings
      </summary>
      <div class="pt-3 space-y-3">
        <div>
          <div class="flex items-center gap-2 mb-2">
            <label class="text-sm font-medium text-gray-900 dark:text-white"
              >GPU preference</label
            >
          </div>
          <div class="space-y-2">
            <label
              class="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
            >
              <input
                v-model="gpuPreferences"
                type="checkbox"
                value="high-performance"
              />
              Prefer high-performance GPU
            </label>
            <label
              class="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
            >
              <input
                v-model="gpuPreferences"
                type="checkbox"
                value="low-power"
              />
              Prefer power-efficient GPU
            </label>
          </div>
        </div>

        <FwbInput
          v-model="config.rpcUrl"
          label="RPC URL"
          placeholder="http://127.0.0.1:10604"
          size="sm"
        />
        <FwbInput
          v-model="config.rpcUser"
          label="RPC username"
          placeholder="lotus"
          size="sm"
        />
        <FwbInput
          v-model="config.rpcPassword"
          type="password"
          label="RPC password"
          placeholder="lotus"
          size="sm"
        />
        <FwbInput
          v-model="config.mineToAddress"
          label="Payout address"
          placeholder="bitcoincash:..."
          size="sm"
        />
        <FwbButton
          color="purple"
          outline
          size="xs"
          :disabled="!walletAddress"
          @click="useWalletAddress"
          >Use wallet address</FwbButton
        >
      </div>
    </details>

    <div v-if="error || message || status.lastError" class="py-2 space-y-1">
      <FwbP v-if="error" class="text-red-500 dark:text-red-400">{{
        error
      }}</FwbP>
      <FwbP v-else-if="message" class="text-purple-600 dark:text-purple-400">{{
        message
      }}</FwbP>
      <FwbP v-if="status.lastError" class="text-red-500 dark:text-red-400"
        >Last error: {{ status.lastError }}</FwbP
      >
    </div>

    <div class="pt-2 flex gap-2">
      <FwbButton
        color="purple"
        :disabled="loading || saving || !dirty || isRunning"
        @click="saveConfig"
        >{{ saving ? 'Saving…' : 'Save changes' }}</FwbButton
      >
      <FwbButton
        v-if="!isRunning"
        color="green"
        :disabled="!canStart"
        :title="
          !isReady
            ? 'WebGPU is not available in this browser'
            : !hasRequiredConfig
              ? 'Complete the miner settings to start'
              : ''
        "
        @click="startMiner"
        >Start mining</FwbButton
      >
      <FwbButton v-else color="red" :disabled="saving" @click="stopMiner"
        >Stop mining</FwbButton
      >
    </div>
  </template>
</template>
