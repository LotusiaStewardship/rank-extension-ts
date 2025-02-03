import { Twitter, Wxt } from '@/utils/types'

class ProfileStore {
  private wxtStorageItems: Record<'profileCache', Wxt.StorageItemString>
  constructor() {
    this.wxtStorageItems = {
      profileCache: storage.defineItem<Wxt.StorageValueString>(
        'local:twitter:profileCache',
        {
          init: () => '{}',
        },
      ),
    }
  }
}
