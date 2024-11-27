import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  extensionApi: 'chrome',
  modules: ['@wxt-dev/module-vue'],
  runner: {
    binaries: {
      chrome: '/Applications/Chromium.app/Contents/MacOS/Chromium'
    }
  },
  manifest: {
    permissions: ['storage'],
    host_permissions: ['*://rank.lotusia.org/api/v1/*']
  }
});
