<script lang="ts" setup>
import { FwbButton, FwbHeading, FwbP } from 'flowbite-vue'
import LoadingSpinnerMessage from '@/components/LoadingSpinnerMessage.vue'
import HomeMyStats from './home/HomeMyStats.vue'
import HomeMinerPanel from './home/HomeMinerPanel.vue'
import type { Ref, ShallowRef } from 'vue'
import type { Unwatch as UnwatchFunction } from 'wxt/storage'
import type {
  AuthorizationHeader,
  AuthenticateHeader,
} from '@/entrypoints/background/modules/instance'
import { InstanceTools } from '@/entrypoints/background/modules/instance'
import { instanceStore } from '@/entrypoints/background/stores/instance'
import { WalletTools } from '@/entrypoints/background/modules/wallet'
import { walletMessaging } from '@/entrypoints/background/messaging'
import { authorizedFetch } from '@/utils/functions'

type MyStats = {
  firstSeen: string
  lastSeen: string
  scriptPayload: string
  totalSats: string
  totalVotes: number
}

const API = {
  url: 'https://rank.lotusia.org/api/v1',
  myStatsSummary() {
    return `${this.url}/wallet/summary/${instanceId.value}/${walletScriptPayload.value}`
  },
}

const watchers: Map<'instanceId', UnwatchFunction> = new Map()
const myStats: Ref<MyStats | null> = ref(null)
const loadingMessage: Ref<string> = ref('Loading your activity...')
const interval: Ref<number> = ref(0)
const instanceId: ShallowRef<string> = shallowRef('')
const authorizationHeader = ref('')
const walletScriptPayload = inject(
  'wallet-script-payload',
) as ShallowRef<string>

const hasWalletContext = computed(() =>
  Boolean(instanceId.value && walletScriptPayload.value),
)

const { setInterval, clearInterval } = window

async function hydrateHomePage() {
  if (!hasWalletContext.value) {
    loadingMessage.value = 'Preparing wallet context...'
    return
  }

  myStats.value = (await getMyStats()) || ({} as MyStats)
}

async function getMyStats(): Promise<MyStats> {
  loadingMessage.value = 'Fetching your stats...'
  try {
    const result = await authorizedFetch(API.myStatsSummary(), {
      Authorization: authorizationHeader.value,
    })
    return result[0] as MyStats
  } catch (headers) {
    const result = await createAuthorizationHeader(headers as Headers)
    if (result) {
      await instanceStore.setAuthorizationHeader(result)
      authorizationHeader.value = result
      return await getMyStats()
    }
    return {} as MyStats
  }
}

async function createAuthorizationHeader(
  headers: Headers,
): Promise<AuthorizationHeader | null> {
  if (!instanceId.value) {
    loadingMessage.value = 'Awaiting instance ID...'
    return null
  }

  const { parseAuthenticateHeader, toAuthorizationHeader } = InstanceTools
  loadingMessage.value = 'Refreshing auth data...'
  const authenticateHeader = headers.get(
    'www-authenticate',
  )! as AuthenticateHeader
  const blockData = parseAuthenticateHeader(authenticateHeader)
  if (!blockData) {
    console.error(
      'Failed to parse authenticate header',
      authenticateHeader,
      blockData,
    )
    return null
  }

  const authDataStr = JSON.stringify({
    instanceId: instanceId.value,
    scriptPayload: walletScriptPayload.value,
    ...blockData,
  })

  const signature = WalletTools.signMessage(
    authDataStr,
    await walletMessaging.sendMessage('popup:loadSigningKey', undefined),
  )

  return toAuthorizationHeader(authDataStr, signature)
}

onMounted(async () => {
  instanceId.value = await instanceStore.getInstanceId()
  authorizationHeader.value = await instanceStore.getAuthorizationHeader()

  watchers.set(
    'instanceId',
    instanceStore.instanceIdStorageItem.watch(newInstanceId => {
      instanceId.value = newInstanceId
      void hydrateHomePage()
    }),
  )

  await hydrateHomePage()

  if (!interval.value) {
    interval.value = setInterval(hydrateHomePage, 15_000)
  }
})

onBeforeUnmount(() => {
  clearInterval(interval.value)
  watchers.forEach(unwatch => unwatch())
})
</script>

<template>
  <div class="space-y-4 px-4 py-3">
    <section
      class="rounded-xl border border-gray-200 dark:border-gray-700 bg-gradient-to-r from-pink-50 to-purple-50 dark:from-gray-900 dark:to-gray-800 p-4"
    >
      <div class="flex items-start justify-between gap-3">
        <div>
          <FwbHeading tag="h5">Lotus Mining Dashboard</FwbHeading>
          <FwbP class="text-sm text-gray-600 dark:text-gray-300 pt-1">
            Start mining, monitor hashrate, and manage settings from one place.
          </FwbP>
        </div>
        <a
          href="https://app.lotusia.org/feed"
          target="_blank"
          rel="noopener noreferrer"
          class="shrink-0"
        >
          <FwbButton color="purple" size="xs">Open Lotusia Feed</FwbButton>
        </a>
      </div>
    </section>

    <section
      class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4"
    >
      <div class="flex items-center justify-between mb-3">
        <FwbHeading tag="h6">Your Stats</FwbHeading>
        <FwbP class="text-xs text-gray-500 dark:text-gray-400"
          >Auto-refresh: 15s</FwbP
        >
      </div>
      <LoadingSpinnerMessage v-if="!myStats" :message="loadingMessage" />
      <HomeMyStats v-else :data="myStats" />
    </section>

    <section
      class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4"
    >
      <HomeMinerPanel />
    </section>
  </div>
</template>
