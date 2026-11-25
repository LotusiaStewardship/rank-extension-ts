import { defineConfig } from 'wxt'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import svgLoader from 'vite-svg-loader'
import tailwindcss from '@tailwindcss/vite'
// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  webExt: {
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
    version: '1.3.1',
    version_name: '1.3.1-beta',
    host_permissions: [
      '*://rank.lotusia.org/api/v1/*',
      '*://chronik.lotusia.org/*',
    ],
    permissions: ['storage', 'notifications'],
  },
  vite: () => ({
    build: {
      commonjsOptions: {
        strictRequires: true,
        //ignoreDynamicRequires: true,
        //transformMixedEsModules: true,
      },
    },
    plugins: [
      tailwindcss(),
      svgLoader({
        defaultImport: 'raw',
        svgo: false,
      }),
      nodePolyfills({
        exclude: ['assert'],
        globals: {
          Buffer: true,
        },
        protocolImports: false,
      }),
      {
        // WXT 0.21 imports every entrypoint through a Vite module runner that can only
        // execute ESM and node builtins, and the polyfills' alias used to send `assert`
        // to the CJS npm package, which died on its bare `require`. Excluding `assert`
        // from the alias lets that runner externalize the node builtin natively, and
        // this hook hands every other environment (the browser build and dev server)
        // the same npm polyfill the alias used to provide. Vite's dev alias plugin runs
        // before user plugins, so this must be a plain resolve hook, not `enforce: pre`.
        name: 'assert-polyfill-for-browser',
        resolveId(source) {
          if (source === 'assert' && this.environment?.name !== 'inline') {
            return this.resolve('assert/build/assert.js', undefined, {
              skipSelf: true,
            })
          }
        },
      },
    ],
  }),
})
