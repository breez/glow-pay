export { initWasm, isWasmInitialized } from './wasmLoader'
export { WalletProvider, useWallet } from './WalletContext'
export {
  initWallet,
  getWalletInfo,
  addEventListener,
  removeEventListener,
  disconnect,
  connected,
  saveMnemonic,
  getSavedMnemonic,
  clearMnemonic,
  getLightningAddress,
  checkLightningAddressAvailable,
  registerLightningAddress,
} from './walletService'
