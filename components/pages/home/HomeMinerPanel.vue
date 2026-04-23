<script setup lang="ts">
import { FwbBadge, FwbButton, FwbHeading, FwbInput, FwbP } from 'flowbite-vue'
import type { ShallowRef } from 'vue'
import type {
  MinerConfig,
  MinerStatus,
  MinerGpuPreference,
  MinerPowerProfile,
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

const POWER_OPTIONS: Array<{
  key: MinerPowerProfile
  title: string
  subtitle: string
}> = [
  {
    key: 'low-power',
    title: 'Eco',
    subtitle: 'Cooler and quieter. Great for background mining.',
  },
  {
    key: 'balanced',
    title: 'Balanced',
    subtitle: 'Recommended default for most systems.',
  },
  {
    key: 'high-power',
    title: 'Turbo',
    subtitle: 'Maximum throughput with higher thermals.',
  },
  {
    key: 'custom',
    title: 'Custom',
    subtitle: 'Fine-tune all controls manually.',
  },
]

const GPU_OPTIONS: Array<{
  preference: MinerGpuPreference
  label: string
  helper: string
}> = [
  {
    preference: 'high-performance',
    label: 'High-performance GPU',
    helper: 'Discrete/performance adapter path',
  },
  {
    preference: 'low-power',
    label: 'Power-efficient GPU',
    helper: 'Integrated/low-power adapter path',
  },
]

const HASHRATE_GRAPH_WIDTH = 320
const HASHRATE_GRAPH_HEIGHT = 72
const HASHRATE_GRAPH_MAX_POINTS = 48

const loading = shallowRef(false)
const saving = shallowRef(false)
const actionMessage = shallowRef('')
const validationError = shallowRef('')

/** Configuration in localStorage. Iniitalized with defaults before loaded via `loadConfig()` */
const storedConfig = ref<MinerConfig>({
  rpcUrl: 'http://127.0.0.1:10604',
  rpcUser: 'lotus',
  rpcPassword: 'lotus',
  mineToAddress: '',
  powerProfile: 'balanced',
  gpuPreferences: ['high-performance'],
  rpcPollIntervalMs: 3000,
  iterations: 16,
  kernelSize: 1 << 23,
  hashrateWindowMs: 5000,
})

/** Runtime status */
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
const hashrateHistory = ref<number[]>([])

const selectedGpuPreferences = computed({
  get() {
    return storedConfig.value.gpuPreferences
  },
  set(next) {
    if (!next.length) {
      storedConfig.value.gpuPreferences = ['high-performance']
      return
    }
    storedConfig.value.gpuPreferences = [...new Set(next)]
  },
})

const isRunning = computed(() => status.value.running)
const hashrateMhs = computed(() => status.value.hashrate / 1_000_000)
const hashrateMhsLabel = computed(() => hashrateMhs.value.toFixed(3))
const testedNoncesLabel = computed(() =>
  BigInt(status.value.testedNonces || '0').toLocaleString(),
)
const estimatedSearchSize = computed(
  () => storedConfig.value.kernelSize * storedConfig.value.iterations,
)

const maxHashrateMhs = computed(() => {
  const values = hashrateHistory.value.map(hashrate => hashrate / 1_000_000)
  return values.length ? Math.max(...values) : 0
})

const avgHashrateMhs = computed(() => {
  if (!hashrateHistory.value.length) return 0
  const total = hashrateHistory.value.reduce((sum, next) => sum + next, 0)
  return total / hashrateHistory.value.length / 1_000_000
})

const graphPoints = computed(() => {
  if (!hashrateHistory.value.length) {
    return `0,${HASHRATE_GRAPH_HEIGHT} ${HASHRATE_GRAPH_WIDTH},${HASHRATE_GRAPH_HEIGHT}`
  }

  const values = hashrateHistory.value.map(hashrate => hashrate / 1_000_000)
  const maxValue = Math.max(0.001, ...values)
  const stepX = HASHRATE_GRAPH_WIDTH / Math.max(1, values.length - 1)

  return values
    .map((hashrate, index) => {
      const x = index * stepX
      const y =
        HASHRATE_GRAPH_HEIGHT - (hashrate / maxValue) * HASHRATE_GRAPH_HEIGHT
      return `${x.toFixed(2)},${Math.max(2, y).toFixed(2)}`
    })
    .join(' ')
})

const profileSummary = computed(() => {
  const profile = storedConfig.value.powerProfile
  if (profile === 'custom') {
    return `Custom • ${storedConfig.value.iterations} iterations • kernel ${storedConfig.value.kernelSize.toLocaleString()}`
  }
  return (
    POWER_OPTIONS.find(option => option.key === profile)?.subtitle ??
    'Balanced profile'
  )
})

function validateConfig(): boolean {
  validationError.value = ''

  if (!storedConfig.value.rpcUrl.trim()) {
    validationError.value = 'RPC URL is required'
    return false
  }
  if (!storedConfig.value.rpcUser.trim()) {
    validationError.value = 'RPC username is required'
    return false
  }
  if (!storedConfig.value.rpcPassword.trim()) {
    validationError.value = 'RPC password is required'
    return false
  }
  if (!storedConfig.value.mineToAddress.trim()) {
    validationError.value = 'Mine-to address is required'
    return false
  }
  if (!storedConfig.value.gpuPreferences.length) {
    validationError.value = 'Select at least one GPU option'
    return false
  }
  if (storedConfig.value.rpcPollIntervalMs < 250) {
    validationError.value = 'RPC poll interval must be at least 250 ms'
    return false
  }
  if (storedConfig.value.iterations < 1) {
    validationError.value = 'Iterations must be at least 1'
    return false
  }
  if (storedConfig.value.kernelSize < 256) {
    validationError.value = 'Kernel size must be at least 256'
    return false
  }
  if (storedConfig.value.hashrateWindowMs < 1000) {
    validationError.value = 'Hashrate window must be at least 1000 ms'
    return false
  }

  return true
}

function applyPowerProfile(profile: MinerPowerProfile) {
  storedConfig.value.powerProfile = profile
  if (profile === 'custom') {
    return
  }
  const preset = POWER_PRESETS[profile]
  storedConfig.value.iterations = preset.iterations
  storedConfig.value.kernelSize = preset.kernelSize
  storedConfig.value.rpcPollIntervalMs = preset.rpcPollIntervalMs
  storedConfig.value.hashrateWindowMs = preset.hashrateWindowMs
}

function inferProfileFromConfig() {
  const match = (
    Object.entries(POWER_PRESETS) as Array<
      [Exclude<MinerPowerProfile, 'custom'>, MinerPreset]
    >
  ).find(
    ([, preset]) =>
      preset.iterations === storedConfig.value.iterations &&
      preset.kernelSize === storedConfig.value.kernelSize &&
      preset.rpcPollIntervalMs === storedConfig.value.rpcPollIntervalMs &&
      preset.hashrateWindowMs === storedConfig.value.hashrateWindowMs,
  )

  storedConfig.value.powerProfile = match?.[0] ?? 'custom'
}

function normalizeConfigDefaults() {
  if (!storedConfig.value.gpuPreferences?.length) {
    storedConfig.value.gpuPreferences = ['high-performance']
  }
  storedConfig.value.gpuPreferences = [
    ...new Set(storedConfig.value.gpuPreferences),
  ]

  if (!storedConfig.value.mineToAddress && walletAddress.value) {
    storedConfig.value.mineToAddress = walletAddress.value
  }

  inferProfileFromConfig()
}

function pushHashrateSample(hashrate: number) {
  hashrateHistory.value.push(hashrate)
  if (hashrateHistory.value.length > HASHRATE_GRAPH_MAX_POINTS) {
    hashrateHistory.value.shift()
  }
}

async function loadConfig() {
  loading.value = true
  try {
    storedConfig.value = await minerMessaging.sendMessage(
      'popup:minerLoadConfig',
      undefined,
    )
    normalizeConfigDefaults()
  } finally {
    loading.value = false
  }
}

async function loadStatus() {
  status.value = await minerMessaging.sendMessage(
    'popup:minerLoadStatus',
    undefined,
  )
  pushHashrateSample(status.value.hashrate)
}

async function saveConfig(): Promise<boolean> {
  if (!validateConfig()) return false

  saving.value = true
  actionMessage.value = ''

  try {
    storedConfig.value = await minerMessaging.sendMessage(
      'popup:minerSaveConfig',
      storedConfig.value,
    )
    actionMessage.value = 'Miner settings saved'
    return true
  } catch (e) {
    actionMessage.value = `Failed to save settings: ${e instanceof Error ? e.message : String(e)}`
    return false
  } finally {
    saving.value = false
  }
}

async function startMiner() {
  const didSave = await saveConfig()
  if (!didSave) return

  actionMessage.value = ''
  status.value = await minerMessaging.sendMessage('popup:minerStart', undefined)
}

async function stopMiner() {
  actionMessage.value = ''
  status.value = await minerMessaging.sendMessage('popup:minerStop', undefined)
}

function useWalletAddress() {
  if (!walletAddress.value) return
  storedConfig.value.mineToAddress = walletAddress.value
}

watch(walletAddress, nextAddress => {
  if (!nextAddress) return
  if (!storedConfig.value.mineToAddress) {
    storedConfig.value.mineToAddress = nextAddress
  }
})

watch(
  () => [
    storedConfig.value.iterations,
    storedConfig.value.kernelSize,
    storedConfig.value.rpcPollIntervalMs,
    storedConfig.value.hashrateWindowMs,
  ],
  () => {
    if (storedConfig.value.powerProfile !== 'custom') {
      const preset =
        POWER_PRESETS[
          storedConfig.value.powerProfile as Exclude<
            MinerPowerProfile,
            'custom'
          >
        ]
      const matchesPreset =
        storedConfig.value.iterations === preset.iterations &&
        storedConfig.value.kernelSize === preset.kernelSize &&
        storedConfig.value.rpcPollIntervalMs === preset.rpcPollIntervalMs &&
        storedConfig.value.hashrateWindowMs === preset.hashrateWindowMs
      if (!matchesPreset) {
        storedConfig.value.powerProfile = 'custom'
      }
      return
    }

    inferProfileFromConfig()
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
  if (refreshTimer.value) {
    clearInterval(refreshTimer.value)
    refreshTimer.value = null
  }
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-start justify-between gap-3">
      <div>
        <FwbHeading tag="h5">Lotus Miner</FwbHeading>
        <FwbP class="text-sm text-gray-600 dark:text-gray-300">
          One-click start with live hashrate tracking.
        </FwbP>
      </div>
      <FwbBadge :type="isRunning ? 'green' : 'red'" size="sm">
        {{ isRunning ? 'Running' : 'Stopped' }}
      </FwbBadge>
    </div>

    <div
      class="rounded-xl border p-3"
      :class="
        isRunning
          ? 'border-green-300 dark:border-green-700 bg-green-50/70 dark:bg-green-950/20'
          : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40'
      "
    >
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <span
            class="inline-block size-3 rounded-full"
            :class="isRunning ? 'bg-green-500 animate-pulse' : 'bg-red-400'"
          />
          <span class="font-semibold">{{
            isRunning ? 'Miner active' : 'Miner offline'
          }}</span>
        </div>
        <div class="text-right">
          <div class="text-2xl font-bold text-pink-600 dark:text-pink-300">
            {{ hashrateMhsLabel }} MH/s
          </div>
          <div class="text-xs text-gray-500 dark:text-gray-400">
            Current hashrate
          </div>
        </div>
      </div>

      <div
        class="mt-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-900/60 p-2"
      >
        <svg
          :viewBox="`0 0 ${HASHRATE_GRAPH_WIDTH} ${HASHRATE_GRAPH_HEIGHT}`"
          class="w-full h-20"
          preserveAspectRatio="none"
        >
          <line
            x1="0"
            :y1="HASHRATE_GRAPH_HEIGHT"
            :x2="HASHRATE_GRAPH_WIDTH"
            :y2="HASHRATE_GRAPH_HEIGHT"
            class="stroke-gray-300 dark:stroke-gray-700"
            stroke-width="1"
          />
          <polyline
            :points="graphPoints"
            fill="none"
            stroke="#db2777"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <div
          class="mt-1 grid grid-cols-3 gap-2 text-xs text-gray-600 dark:text-gray-300"
        >
          <div>
            Now: <span class="font-semibold">{{ hashrateMhsLabel }} MH/s</span>
          </div>
          <div>
            Avg:
            <span class="font-semibold"
              >{{ avgHashrateMhs.toFixed(3) }} MH/s</span
            >
          </div>
          <div class="text-right">
            Peak:
            <span class="font-semibold"
              >{{ maxHashrateMhs.toFixed(3) }} MH/s</span
            >
          </div>
        </div>
      </div>

      <div class="mt-2 text-xs text-gray-600 dark:text-gray-300">
        Tested nonces:
        <span class="font-semibold">{{ testedNoncesLabel }}</span>
      </div>
    </div>

    <div class="grid gap-2">
      <FwbP class="text-sm font-semibold">Power profile</FwbP>
      <div class="grid grid-cols-2 gap-2">
        <button
          v-for="option in POWER_OPTIONS"
          :key="option.key"
          type="button"
          class="rounded-lg border p-2 text-left transition"
          :class="
            storedConfig.powerProfile === option.key
              ? 'border-pink-500 bg-pink-50 dark:bg-pink-900/20'
              : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/60'
          "
          @click="applyPowerProfile(option.key)"
        >
          <div class="text-sm font-semibold">{{ option.title }}</div>
          <div class="text-xs text-gray-600 dark:text-gray-400">
            {{ option.subtitle }}
          </div>
        </button>
      </div>
      <FwbP class="text-xs text-gray-500 dark:text-gray-400">{{
        profileSummary
      }}</FwbP>
    </div>

    <div class="grid gap-2">
      <FwbP class="text-sm font-semibold">GPU adapters</FwbP>
      <div class="grid gap-2">
        <label
          v-for="gpu in GPU_OPTIONS"
          :key="gpu.preference"
          class="flex items-start gap-2 rounded-lg border border-gray-200 dark:border-gray-700 p-2"
        >
          <input
            v-model="selectedGpuPreferences"
            type="checkbox"
            :value="gpu.preference"
            class="mt-1"
          />
          <div>
            <div class="text-sm font-medium">{{ gpu.label }}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400">
              {{ gpu.helper }}
            </div>
          </div>
        </label>
      </div>
    </div>

    <div
      class="grid gap-3 rounded-xl border border-gray-200 dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-800/40"
    >
      <div>
        <div class="flex justify-between text-xs mb-1">
          <span>Iterations</span>
          <span class="font-semibold">{{ storedConfig.iterations }}</span>
        </div>
        <input
          v-model.number="storedConfig.iterations"
          type="range"
          min="1"
          max="64"
          step="1"
          class="w-full"
        />
      </div>

      <div>
        <div class="flex justify-between text-xs mb-1">
          <span>Kernel size</span>
          <span class="font-semibold">{{
            storedConfig.kernelSize.toLocaleString()
          }}</span>
        </div>
        <input
          v-model.number="storedConfig.kernelSize"
          type="range"
          :min="262144"
          :max="33554432"
          :step="262144"
          class="w-full"
        />
      </div>

      <div>
        <div class="flex justify-between text-xs mb-1">
          <span>RPC poll interval</span>
          <span class="font-semibold"
            >{{ storedConfig.rpcPollIntervalMs }} ms</span
          >
        </div>
        <input
          v-model.number="storedConfig.rpcPollIntervalMs"
          type="range"
          :min="250"
          :max="10000"
          :step="250"
          class="w-full"
        />
      </div>

      <div>
        <div class="flex justify-between text-xs mb-1">
          <span>Hashrate window</span>
          <span class="font-semibold"
            >{{ storedConfig.hashrateWindowMs }} ms</span
          >
        </div>
        <input
          v-model.number="storedConfig.hashrateWindowMs"
          type="range"
          :min="1000"
          :max="20000"
          :step="500"
          class="w-full"
        />
      </div>

      <div class="text-xs text-gray-600 dark:text-gray-300">
        Work size per search:
        <span class="font-semibold">{{
          estimatedSearchSize.toLocaleString()
        }}</span>
        nonces
      </div>
    </div>

    <details class="rounded-xl border border-gray-200 dark:border-gray-700 p-3">
      <summary class="cursor-pointer text-sm font-semibold">
        Connection & payout settings
      </summary>
      <div class="pt-3 grid gap-2">
        <FwbInput
          v-model="storedConfig.rpcUrl"
          label="RPC URL"
          placeholder="http://127.0.0.1:10604"
          size="sm"
        />
        <FwbInput
          v-model="storedConfig.rpcUser"
          label="RPC Username"
          placeholder="lotus"
          size="sm"
        />
        <FwbInput
          v-model="storedConfig.rpcPassword"
          type="password"
          label="RPC Password"
          placeholder="lotus"
          size="sm"
        />
        <div>
          <FwbInput
            v-model="storedConfig.mineToAddress"
            label="Mine-to address"
            placeholder="bitcoincash:..."
            size="sm"
          />
          <div class="pt-1">
            <FwbButton
              color="purple"
              outline
              size="xs"
              @click="useWalletAddress"
              :disabled="!walletAddress"
            >
              Use wallet address
            </FwbButton>
          </div>
        </div>
      </div>
    </details>

    <div class="flex flex-wrap gap-2">
      <FwbBadge :type="status.webgpuAvailable ? 'green' : 'red'" size="sm">
        API {{ status.webgpuAvailable ? 'ready' : 'unavailable' }}
      </FwbBadge>
      <FwbBadge
        :type="status.webgpuAdapterAvailable ? 'green' : 'yellow'"
        size="sm"
      >
        Adapter
        {{ status.webgpuAdapterAvailable ? 'detected' : 'not detected' }}
      </FwbBadge>
      <FwbBadge
        :type="status.webgpuPipelineReady ? 'green' : 'yellow'"
        size="sm"
      >
        Pipeline {{ status.webgpuPipelineReady ? 'ready' : 'pending' }}
      </FwbBadge>
    </div>

    <FwbP
      v-if="validationError"
      class="text-sm text-red-500 dark:text-red-300"
      >{{ validationError }}</FwbP
    >
    <FwbP
      v-if="actionMessage"
      class="text-sm text-purple-600 dark:text-purple-300"
      >{{ actionMessage }}</FwbP
    >
    <FwbP
      v-if="status.lastError"
      class="text-sm text-red-500 dark:text-red-300"
    >
      Last error: {{ status.lastError }}
    </FwbP>

    <div class="flex gap-2 pt-1">
      <FwbButton
        color="purple"
        @click="saveConfig"
        :disabled="loading || saving || isRunning"
      >
        Save settings
      </FwbButton>
      <FwbButton
        color="green"
        @click="startMiner"
        :disabled="!status.webgpuAvailable || isRunning || loading"
      >
        Start
      </FwbButton>
      <FwbButton color="red" @click="stopMiner" :disabled="!isRunning">
        Stop
      </FwbButton>
    </div>
  </div>
</template>
