import { createApp } from 'vue'
//import PrimeVue, { defaultOptions, PrimeVueConfiguration } from 'primevue/config'
import App from './App.vue'
import './style.css'

const app = createApp(App)
/*
app.use(PrimeVue, {
  ...defaultOptions,
  theme: {
    preset: 'Nora',
    options: {
      prefix: 'app',
    },
  },
} satisfies PrimeVueConfiguration)
*/
app.mount('#app')
