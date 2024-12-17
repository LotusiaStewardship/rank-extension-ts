export default defineBackground({
  main: () => {
    import('./lib/wallet').then(({ Wallet }) => {
      const mnemonic = Wallet.newMnemonicPhrase()
      const hdPrivkey = Wallet.getHdPrivkeyFromMnemonic(mnemonic)
      const privkey = Wallet.getDefaultPrivkey(hdPrivkey)
      const address = privkey.toAddress().toXAddress()
      console.log(`${privkey.toWIF()}:${address}`)
    })
    try {
    } catch (e) {
      console.error(e)
    }
    console.log('Hello background!', { id: browser.runtime.id })
  },
  type: 'module',
})
