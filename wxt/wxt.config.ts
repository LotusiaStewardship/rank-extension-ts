import { defineConfig } from 'wxt'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// See https://wxt.dev/api/config.html
export default defineConfig({
  extensionApi: 'chrome',
  modules: ['@wxt-dev/module-vue'],
  runner: {
    binaries: {
      chrome: '/Applications/Chromium.app/Contents/MacOS/Chromium',
    },
  },
  manifestVersion: 3,
  manifest: {
    host_permissions: ['*://rank.lotusia.org/api/v1/*', '*://chronik.lotusia.org/*'],
    description: 'Burn Lotus to uprank and downrank social media influencers and content',
    permissions: ['storage', 'notifications'],
  },
  vite: () => ({
    build: {
      modulePreload: false,
    },
    plugins: [
      nodePolyfills({
        globals: {
          Buffer: true,
        },
        protocolImports: false,
      }),
    ],
  }),
})
