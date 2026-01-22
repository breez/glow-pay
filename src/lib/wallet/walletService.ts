import * as breezSdk from '@breeztech/breez-sdk-spark'

interface EventListener {
  onEvent: (event: breezSdk.SdkEvent) => void
}

interface LogEntryLike {
  level: string
  line: string
}

class WebLogger {
  log = (logEntry: LogEntryLike) => {
    const ts = new Date().toISOString()
    console.log(`${ts} [${logEntry.level}]: ${logEntry.line}`)
  }
}

let sdk: breezSdk.BreezSdk | null = null
let logger: WebLogger | null = null

const API_KEY = 'MIIBazCCAR2gAwIBAgIHPdG0GExEwzAFBgMrZXAwEDEOMAwGA1UEAxMFQnJlZXowHhcNMjUwMjIwMTIyODIxWhcNMzUwMjE4MTIyODIxWjAnMQ0wCwYDVQQKEwRUZXN0MRYwFAYDVQQDEw1Sb3kgU2hlaW5mZWxkMCowBQYDK2VwAyEA0IP1y98gPByiIMoph1P0G6cctLb864rNXw1LRLOpXXejfzB9MA4GA1UdDwEB/wQEAwIFoDAMBgNVHRMBAf8EAjAAMB0GA1UdDgQWBBTaOaPuXmtLDTJVv++VYBiQr9gHCTAfBgNVHSMEGDAWgBTeqtaSVvON53SSFvxMtiCyayiYazAdBgNVHREEFjAUgRJraW5nb25seUBnbWFpbC5jb20wBQYDK2VwA0EAINTIeR5+LrLIngPjGFrBrPzdRv4yN8kjNgRVdFDoa1fZPlynm4GjKoTGg8sHxEcRKP1QN2YP0s6NSDT3C+MIDw=='

export const initWallet = async (mnemonic: string, network: breezSdk.Network = 'mainnet'): Promise<void> => {
  if (sdk) return

  if (!logger) {
    logger = new WebLogger()
    breezSdk.initLogging(logger)
  }
  
  const config = breezSdk.defaultConfig(network)
  config.apiKey = API_KEY
  config.privateEnabledDefault = false
  config.lnurlDomain = 'breez.cash'
  
  sdk = await breezSdk.connect({
    config,
    seed: { type: 'mnemonic', mnemonic },
    storageDir: 'glow-pay-wallet',
  })
  
  // Enable public mode for LNURL-verify
  await sdk.updateUserSettings({ sparkPrivateModeEnabled: false }).catch(() => {})
}

export const getWalletInfo = async (): Promise<breezSdk.GetInfoResponse | null> => {
  if (!sdk) return null
  return await sdk.getInfo({})
}

export const addEventListener = async (callback: (event: breezSdk.SdkEvent) => void): Promise<string> => {
  if (!sdk) throw new Error('SDK not initialized')
  const listener: EventListener = { onEvent: callback }
  return await sdk.addEventListener(listener)
}

export const removeEventListener = async (listenerId: string): Promise<void> => {
  if (!sdk || !listenerId) return
  await sdk.removeEventListener(listenerId)
}

export const disconnect = async (): Promise<void> => {
  if (sdk) {
    await sdk.disconnect()
    sdk = null
  }
}

export const connected = (): boolean => sdk !== null

export const saveMnemonic = (mnemonic: string): void => {
  localStorage.setItem('glowpay_mnemonic', mnemonic)
}

export const getSavedMnemonic = (): string | null => {
  return localStorage.getItem('glowpay_mnemonic')
}

export const clearMnemonic = (): void => {
  localStorage.removeItem('glowpay_mnemonic')
}

export const getLightningAddress = async (): Promise<breezSdk.LightningAddressInfo | null> => {
  if (!sdk) throw new Error('SDK not initialized')
  return await sdk.getLightningAddress() ?? null
}

export const checkLightningAddressAvailable = async (username: string): Promise<boolean> => {
  if (!sdk) throw new Error('SDK not initialized')
  return await sdk.checkLightningAddressAvailable({ username })
}

export const registerLightningAddress = async (username: string, description: string): Promise<void> => {
  if (!sdk) throw new Error('SDK not initialized')
  await sdk.registerLightningAddress({ username, description })
}
