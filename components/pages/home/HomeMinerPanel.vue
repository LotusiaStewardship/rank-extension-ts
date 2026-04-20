<script setup lang="ts">
import { FwbButton, FwbHeading, FwbInput, FwbP } from 'flowbite-vue'
import type { ShallowRef } from 'vue'
import type {
  MinerConfig,
  MinerStatus,
  MinerGpuPreference,
  MinerPowerProfile,
} from '@/entrypoints/background/stores'
import { minerMessaging } from '@/entrypoints/background/messaging'

const walletAddress = inject('wallet-address', shallowRef('')) as ShallowRef<string>

type MinerPreset = Pick<MinerConfig, 'iterations' | 'kernelSize' | 'rpcPollIntervalMs' | 'hashrateWindowMs'>

const POWER_PRESETS: Record<Exclude<MinerPowerProfile, 'custom'>, MinerPreset> = {
  'low-power': {
    iterations: 8,
    kernelSize: 1 << 21,
    rpcPollIntervalMs: 5000,
    hashrateWindowMs: 7000,
  },
  balanced: {
    iterations: 16,
    kernelSize: 1 << 23,
    rpcPollIntervalMs: 3000,
    hashrateWindowMs: 5000,
  },
  'high-power': {
    iterations: 32,
    kernelSize: 1 << 24,
    rpcPollIntervalMs: 2000,
    hashrateWindowMs: 4000,
  },
}

const POWER_OPTIONS: Array<{ key: MinerPowerProfile, title: string, subtitle: string }> = [
  {
    key: 'low-power',
    title: 'Low power',
    subtitle: 'Lower heat and power draw. Best for laptops and multitasking.',
  },
  {
    key: 'balanced',
    title: 'Balanced',
    subtitle: 'Recommended default for everyday mining.',
  },
  {
    key: 'high-power',
    title: 'High power',
    subtitle: 'Max throughput profile with higher thermals.',
  },
  {
    key: 'custom',
    title: 'Custom',
    subtitle: 'Tune iterations, kernel size, and polling manually.',
  },
]

const GPU_OPTIONS: Array<{ value: MinerGpuPreference, label: string, helper: string }> = [
  {
    value: 'high-performance',
    label: 'High-performance GPU',
    helper: 'Prefer discrete/performance adapter first.',
  },
  {
    value: 'low-power',
    label: 'Low-power GPU',
    helper: 'Allow integrated/power-efficient adapter fallback.',
  },
]

const loading = shallowRef(false)
const saving = shallowRef(false)
const actionMessage = shallowRef('')
const validationError = shallowRef('')

const config = ref<MinerConfig>({
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

const status = ref<MinerStatus>({
  running: false,
  hashrate: 0,
  testedNonces: '0',
  webgpuSupported: false,
  lastError: '',
  updatedAt: 0,
})

const refreshTimer = ref<ReturnType<typeof setInterval> | null>(null)
const showAdvancedSettings = ref(false)

const selectedGpuPreferences = computed({
  get() {
    return config.value.gpuPreferences
  },
  set(next) {
    if (!next.length) {
      config.value.gpuPreferences = ['high-performance']
      return
    }
    config.value.gpuPreferences = [...new Set(next)]
  },
})

const hashrateMhs = computed(() => (status.value.hashrate / 1_000_000).toFixed(3))

const profileSummary = computed(() => {
  const profile = config.value.powerProfile
  if (profile === 'custom') {
    return `Custom • ${config.value.iterations} iters • kernel ${config.value.kernelSize.toLocaleString()}`
  }
  return POWER_OPTIONS.find(option => option.key === profile)?.subtitle ?? 'Balanced profile'
})

function validateConfig(): boolean {
  validationError.value = ''
  if (!config.value.rpcUrl.trim()) {
    validationError.value = 'RPC URL is required'
    return false
  }
  if (!config.value.rpcUser.trim()) {
    validationError.value = 'RPC username is required'
    return false
  }
  if (!config.value.rpcPassword.trim()) {
    validationError.value = 'RPC password is required'
    return false
  }
  if (!config.value.mineToAddress.trim()) {
    validationError.value = 'Mine-to address is required'
    return false
  }
  if (!config.value.gpuPreferences.length) {
    validationError.value = 'Select at least one GPU preference'
    return false
  }
  if (config.value.rpcPollIntervalMs < 250) {
    validationError.value = 'RPC poll interval must be at least 250ms'
    return false
  }
  if (config.value.iterations < 1) {
    validationError.value = 'Iterations must be >= 1'
    return false
  }
  if (config.value.kernelSize < 256) {
    validationError.value = 'Kernel size must be >= 256'
    return false
  }
  if (config.value.hashrateWindowMs < 1000) {
    validationError.value = 'Hashrate window must be >= 1000ms'
    return false
  }
  return true
}

function applyPowerProfile(profile: MinerPowerProfile) {
  config.value.powerProfile = profile
  if (profile === 'custom') {
    return
  }
  const preset = POWER_PRESETS[profile]
  config.value.iterations = preset.iterations
  config.value.kernelSize = preset.kernelSize
  config.value.rpcPollIntervalMs = preset.rpcPollIntervalMs
  config.value.hashrateWindowMs = preset.hashrateWindowMs
}

function inferProfileFromConfig() {
  const match = (Object.entries(POWER_PRESETS) as Array<[Exclude<MinerPowerProfile, 'custom'>, MinerPreset]>)
    .find(([, preset]) =>
      preset.iterations === config.value.iterations
      && preset.kernelSize === config.value.kernelSize
      && preset.rpcPollIntervalMs === config.value.rpcPollIntervalMs
      && preset.hashrateWindowMs === config.value.hashrateWindowMs,
    )

  config.value.powerProfile = match?.[0] ?? 'custom'
}

function normalizeConfigDefaults() {
  if (!config.value.gpuPreferences?.length) {
    config.value.gpuPreferences = ['high-performance']
  }
  config.value.gpuPreferences = [...new Set(config.value.gpuPreferences)]

  if (!config.value.mineToAddress && walletAddress.value) {
    config.value.mineToAddress = walletAddress.value
  }

  inferProfileFromConfig()
}

async function loadConfig() {
  loading.value = true
  try {
    config.value = await minerMessaging.sendMessage('popup:minerLoadConfig', undefined)
    normalizeConfigDefaults()
  } finally {
    loading.value = false
  }
}

async function loadStatus() {
  status.value = await minerMessaging.sendMessage('popup:minerLoadStatus', undefined)
}

async function saveConfig() {
  if (!validateConfig()) return
  saving.value = true
  actionMessage.value = ''
  try {
    config.value = await minerMessaging.sendMessage('popup:minerSaveConfig', config.value)
    actionMessage.value = 'Miner configuration saved'
  } catch (e) {
    actionMessage.value = `Failed to save config: ${e instanceof Error ? e.message : String(e)}`
  } finally {
    saving.value = false
  }
}

async function startMiner() {
  if (!validateConfig()) return
  await saveConfig()
  actionMessage.value = ''
  const nextStatus = await minerMessaging.sendMessage('popup:minerStart', undefined)
  status.value = nextStatus
}

async function stopMiner() {
  actionMessage.value = ''
  const nextStatus = await minerMessaging.sendMessage('popup:minerStop', undefined)
  status.value = nextStatus
}

function useWalletAddress() {
  if (!walletAddress.value) return
  config.value.mineToAddress = walletAddress.value
}

watch(walletAddress, nextAddress => {
  if (!nextAddress) return
  if (!config.value.mineToAddress) {
    config.value.mineToAddress = nextAddress
  }
})

watch(
  () => [
    config.value.iterations,
    config.value.kernelSize,
    config.value.rpcPollIntervalMs,
    config.value.hashrateWindowMs,
  ],
  () => {
    if (config.value.powerProfile !== 'custom') {
      const preset = POWER_PRESETS[config.value.powerProfile as Exclude<MinerPowerProfile, 'custom'>]
      const matchesPreset =
        config.value.iterations === preset.iterations
        && config.value.kernelSize === preset.kernelSize
        && config.value.rpcPollIntervalMs === preset.rpcPollIntervalMs
        && config.value.hashrateWindowMs === preset.hashrateWindowMs
      if (!matchesPreset) {
        config.value.powerProfile = 'custom'
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
  <div class="py-2 px-6">
    <FwbHeading tag="h5" class="mb-2">Lotus Miner</FwbHeading>
    <FwbP class="mb-2">
      Run local solo mining with a safe default profile and optional advanced controls.
    </FwbP>

    <div class="mb-3 rounded-md border border-gray-200 dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-800/40">
      <FwbP class="text-xs mb-1"><strong>Payout address</strong></FwbP>
      <FwbP class="text-xs break-all text-gray-700 dark:text-gray-300">
        {{ config.mineToAddress || 'Waiting for wallet address…' }}
      </FwbP>
    </div>

    <div class="mb-4">
      <FwbP class="text-sm font-medium mb-2">Power profile</FwbP>
      <div class="grid gap-2">
        <label
          v-for="option in POWER_OPTIONS"
          :key="option.key"
          class="flex items-start gap-2 rounded-md border p-2 cursor-pointer transition"
          :class="config.powerProfile === option.key
            ? 'border-pink-500 bg-pink-50 dark:bg-pink-900/20'
            : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50'"
        >
          <input
            type="radio"
            name="miner-power-profile"
            class="mt-1"
            :checked="config.powerProfile === option.key"
            @change="applyPowerProfile(option.key)"
          />
          <div>
            <div class="text-sm font-medium">{{ option.title }}</div>
            <div class="text-xs text-gray-600 dark:text-gray-400">{{ option.subtitle }}</div>
          </div>
        </label>
      </div>
      <FwbP class="text-xs text-gray-600 dark:text-gray-400 pt-2">{{ profileSummary }}</FwbP>
    </div>

    <div class="mb-4">
      <FwbP class="text-sm font-medium mb-2">GPU selection</FwbP>
      <div class="grid gap-2">
        <label
          v-for="gpu in GPU_OPTIONS"
          :key="gpu.value"
          class="flex items-start gap-2 rounded-md border border-gray-200 dark:border-gray-700 p-2"
        >
          <input
            type="checkbox"
            class="mt-1"
            v-model="selectedGpuPreferences"
            :value="gpu.value"
          />
          <div>
            <div class="text-sm font-medium">{{ gpu.label }}</div>
            <div class="text-xs text-gray-600 dark:text-gray-400">{{ gpu.helper }}</div>
          </div>
        </label>
      </div>
    </div>

    <div class="grid gap-2">
      <FwbInput v-model="config.rpcUrl" label="RPC URL" placeholder="http://127.0.0.1:10604" size="sm" />
      <FwbInput v-model="config.rpcUser" label="RPC Username" placeholder="lotus" size="sm" />
      <FwbInput v-model="config.rpcPassword" type="password" label="RPC Password" placeholder="lotus" size="sm" />

      <div>
        <FwbInput v-model="config.mineToAddress" label="Mine To Address" placeholder="bitcoincash:..." size="sm" />
        <div class="pt-1">
          <FwbButton color="pink" outline size="xs" @click="useWalletAddress" :disabled="!walletAddress">
            Reset to wallet address
          </FwbButton>
        </div>
      </div>

      <div>
        <button
          class="text-xs text-pink-600 dark:text-pink-300 underline"
          type="button"
          @click="showAdvancedSettings = !showAdvancedSettings"
        >
          {{ showAdvancedSettings ? 'Hide advanced settings' : 'Show advanced settings' }}
        </button>

        <div v-if="showAdvancedSettings" class="pt-2 grid gap-2">
          <div class="grid grid-cols-2 gap-2">
            <FwbInput v-model.number="config.rpcPollIntervalMs" type="number" label="RPC Poll (ms)" size="sm" min="250" />
            <FwbInput v-model.number="config.hashrateWindowMs" type="number" label="Hashrate Window (ms)" size="sm" min="1000" />
          </div>

          <div class="grid grid-cols-2 gap-2">
            <FwbInput v-model.number="config.iterations" type="number" label="Iterations" size="sm" min="1" />
            <FwbInput v-model.number="config.kernelSize" type="number" label="Kernel Size" size="sm" min="256" step="256" />
          </div>
        </div>
      </div>
    </div>

    <FwbP v-if="validationError" class="text-red-500 dark:text-red-300 pt-2">{{ validationError }}</FwbP>
    <FwbP v-if="actionMessage" class="text-purple-600 dark:text-purple-300 pt-2">{{ actionMessage }}</FwbP>

    <div class="pt-3 flex gap-2">
      <FwbButton color="pink" @click="saveConfig" :disabled="loading || saving || status.running">
        Save Config
      </FwbButton>
      <FwbButton color="green" @click="startMiner" :disabled="!status.webgpuSupported || status.running || loading">
        Start Miner
      </FwbButton>
      <FwbButton color="red" @click="stopMiner" :disabled="!status.running">
        Stop Miner
      </FwbButton>
    </div>

    <div class="pt-4 text-sm">
      <FwbP>
        <strong>WebGPU:</strong>
        <span :class="status.webgpuSupported ? 'text-green-600 dark:text-green-300' : 'text-red-500 dark:text-red-300'">
          {{ status.webgpuSupported ? 'Supported' : 'Not supported in this runtime' }}
        </span>
      </FwbP>
      <FwbP><strong>Status:</strong> {{ status.running ? 'Running' : 'Stopped' }}</FwbP>
      <FwbP><strong>Hashrate:</strong> {{ hashrateMhs }} MH/s</FwbP>
      <FwbP v-if="status.lastError" class="text-red-500 dark:text-red-300"><strong>Last error:</strong> {{ status.lastError }}</FwbP>
    </div>
  </div>
</template>
