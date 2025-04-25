import { defineExtensionMessaging } from '@webext-core/messaging'

interface InstanceMessaging {
  'popup:registerInstance': (data: {
    optin: boolean
    signature: string
  }) => void
}

const instanceMessaging = defineExtensionMessaging<InstanceMessaging>()
export { instanceMessaging }
