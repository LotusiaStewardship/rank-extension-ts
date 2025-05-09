import { defineConfig } from 'wxt'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import svgLoader from 'vite-svg-loader'
import tailwindcss from 'tailwindcss'
// See https://wxt.dev/api/config.html
export default defineConfig({
  entrypointLoader: 'vite-node',
  extensionApi: 'chrome',
  modules: ['@wxt-dev/module-vue'],
  runner: {
    binaries: {
      chrome: '/Applications/Chromium.app/Contents/MacOS/Chromium',
      safari: '/Applications/Safari.app/Contents/MacOS/Safari',
    },
  },
  manifestVersion: 3,
  manifest: {
    name: 'Lotusia',
    description:
      'A decentralized, community-moderated reputation system for social media, powered by Lotus',
    version: '1.0.1',
    version_name: '1.0.1-beta',
    host_permissions: [
      '*://rank.lotusia.org/api/v1/*',
      '*://chronik.lotusia.org/*',
    ],
    permissions: ['storage', 'notifications'],
  },
  vite: () => ({
    css: {
      postcss: {
        plugins: [tailwindcss()],
      },
    },
    build: {
      commonjsOptions: {
        strictRequires: true,
        //ignoreDynamicRequires: true,
        //transformMixedEsModules: true,
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
