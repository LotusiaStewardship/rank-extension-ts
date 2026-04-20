<script setup lang="ts">
import { FwbButton, FwbHeading, FwbInput, FwbP } from 'flowbite-vue'
import type { ShallowRef } from 'vue'
import type { MinerConfig, MinerStatus } from '@/entrypoints/background/stores'
import { minerMessaging } from '@/entrypoints/background/messaging'

const walletAddress = inject('wallet-address', shallowRef('')) as ShallowRef<string>

const loading = shallowRef(false)
const saving = shallowRef(false)
const actionMessage = shallowRef('')
const validationError = shallowRef('')

const config = ref<MinerConfig>({
  rpcUrl: 'http://127.0.0.1:10604',
  rpcUser: 'lotus',
  rpcPassword: 'lotus',
  mineToAddress: '',
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

const hashrateMhs = computed(() => (status.value.hashrate / 1_000_000).toFixed(3))

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

async function loadConfig() {
  loading.value = true
  try {
    config.value = await minerMessaging.sendMessage('popup:minerLoadConfig', undefined)
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
      Configure and run a local Lotus solo miner with your connected Lotus node.
    </FwbP>

    <div class="grid gap-2">
      <FwbInput v-model="config.rpcUrl" label="RPC URL" placeholder="http://127.0.0.1:10604" size="sm" />
      <FwbInput v-model="config.rpcUser" label="RPC Username" placeholder="lotus" size="sm" />
      <FwbInput v-model="config.rpcPassword" type="password" label="RPC Password" placeholder="lotus" size="sm" />

      <div>
        <FwbInput v-model="config.mineToAddress" label="Mine To Address" placeholder="bitcoincash:..." size="sm" />
        <div class="pt-1">
          <FwbButton color="pink" outline size="xs" @click="useWalletAddress" :disabled="!walletAddress">
            Use current wallet address
          </FwbButton>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <FwbInput v-model.number="config.rpcPollIntervalMs" type="number" label="RPC Poll (ms)" size="sm" min="250" />
        <FwbInput v-model.number="config.hashrateWindowMs" type="number" label="Hashrate Window (ms)" size="sm" min="1000" />
      </div>

      <div class="grid grid-cols-2 gap-2">
        <FwbInput v-model.number="config.iterations" type="number" label="Iterations" size="sm" min="1" />
        <FwbInput v-model.number="config.kernelSize" type="number" label="Kernel Size" size="sm" min="256" step="256" />
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
      <FwbP><strong>Nonces tested:</strong> {{ status.testedNonces }}</FwbP>
      <FwbP v-if="status.lastError" class="text-red-500 dark:text-red-300"><strong>Last error:</strong> {{ status.lastError }}</FwbP>
    </div>
  </div>
</template>
