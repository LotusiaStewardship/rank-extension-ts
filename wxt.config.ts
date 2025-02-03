import { defineConfig } from 'wxt'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import svgLoader from 'vite-svg-loader'

// See https://wxt.dev/api/config.html
export default defineConfig({
  entrypointLoader: 'vite-node',
  extensionApi: 'chrome',
  modules: ['@wxt-dev/module-vue'],
  runner: {
    binaries: {
      chrome: '/Applications/Chromium.app/Contents/MacOS/Chromium',
    },
  },
  manifestVersion: 3,
  manifest: {
    name: 'Lotus Voting System',
    description:
      'Add a voting system to social media platforms to establish social reputation of online profiles',
    version: '0.1.1',
    version_name: '0.1.1-alpha',
    host_permissions: ['*://rank.lotusia.org/api/v1/*', '*://chronik.lotusia.org/*'],
    permissions: ['storage', 'notifications'],
  },
  vite: () => ({
    build: {
      commonjsOptions: {
        strictRequires: true,
        //ignoreDynamicRequires: true,
        //transformMixedEsModules: false,
      },
    },
    plugins: [
      svgLoader({
        defaultImport: 'raw',
        svgo: false,
      }),
      nodePolyfills({
        globals: {
          Buffer: true,
        },
        protocolImports: false,
      }),
    ],
  }),
})
