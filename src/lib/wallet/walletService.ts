import * as breezSdk from '@breeztech/breez-sdk-spark'
import { isWasmInitialized } from './wasmLoader'

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

export interface WalletInstance {
  sdk: breezSdk.BreezSdk
  lightningAddress: string | null
}

let wallet: WalletInstance | null = null
let logger: WebLogger | null = null

const API_KEY = 'MIIBazCCAR2gAwIBAgIHPdG0GExEwzAFBgMrZXAwEDEOMAwGA1UEAxMFQnJlZXowHhcNMjUwMjIwMTIyODIxWhcNMzUwMjE4MTIyODIxWjAnMQ0wCwYDVQQKEwRUZXN0MRYwFAYDVQQDEw1Sb3kgU2hlaW5mZWxkMCowBQYDK2VwAyEA0IP1y98gPByiIMoph1P0G6cctLb864rNXw1LRLOpXXejfzB9MA4GA1UdDwEB/wQEAwIFoDAMBgNVHRMBAf8EAjAAMB0GA1UdDgQWBBTaOaPuXmtLDTJVv++VYBiQr9gHCTAfBgNVHSMEGDAWgBTeqtaSVvON53SSFvxMtiCyayiYazAdBgNVHREEFjAUgRJraW5nb25seUBnbWFpbC5jb20wBQYDK2VwA0EAINTIeR5+LrLIngPjGFrBrPzdRv4yN8kjNgRVdFDoa1fZPlynm4GjKoTGg8sHxEcRKP1QN2YP0s6NSDT3C+MIDw=='

type EventCallback = (event: breezSdk.SdkEvent) => void
let eventCallback: EventCallback | null = null
let earlyListenerId: string | null = null

export const setEventCallback = (cb: EventCallback): void => {
  eventCallback = cb
}

export const getEarlyListenerId = (): string | null => earlyListenerId

const connectWallet = async (network: breezSdk.Network, mnemonic: string): Promise<WalletInstance> => {
  const config = breezSdk.defaultConfig(network)
  config.apiKey = API_KEY
  config.supportLnurlVerify = true
  config.lnurlDomain = 'breez.cash'

  const seed: breezSdk.Seed = { type: 'mnemonic', mnemonic }

  let builder = breezSdk.SdkBuilder.new(config, seed)
  builder = await builder.withDefaultStorage('glow-pay-wallet-0')
  const sdk = await builder.build()

  // Add event listener immediately — before sync events can be missed
  if (eventCallback) {
    const cb = eventCallback
    const listener: EventListener = {
      onEvent: (event) => cb(event),
    }
    earlyListenerId = await sdk.addEventListener(listener)
  }

  const addrInfo = await sdk.getLightningAddress().catch(() => undefined)

  console.log(`Wallet connected${addrInfo ? ` (${addrInfo.lightningAddress})` : ''}`)

  return {
    sdk,
    lightningAddress: addrInfo?.lightningAddress ?? null,
  }
}

export const initWallet = async (mnemonic: string, network: breezSdk.Network = 'mainnet'): Promise<void> => {
  if (wallet) return

  if (!isWasmInitialized()) {
    throw new Error('WASM module not initialized. Please refresh the page.')
  }

  if (!logger) {
    logger = new WebLogger()
    breezSdk.initLogging(logger)
  }

  wallet = await connectWallet(network, mnemonic)
}

// Generate a random 8-char lowercase username
export const generateRandomUsername = (): string => {
  const chars = 'abcdefghijklmnopqrstuvwxyz'
  let result = ''
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

// Generate a friendly "ColorAnimal" username (for primary address)
// Matches glow-web's randomName pattern
const COLORS = [
  'salmon', 'blue', 'turquoise', 'orchid', 'purple', 'tomato', 'cyan', 'crimson',
  'orange', 'lime', 'pink', 'green', 'red', 'yellow', 'azure', 'silver', 'magenta',
  'olive', 'violet', 'rose', 'wine', 'mint', 'indigo', 'jade', 'coral',
]
const ANIMALS = [
  'bat', 'bear', 'boar', 'cat', 'chick', 'cow', 'deer', 'dog', 'eagle', 'elephant',
  'fox', 'frog', 'hippo', 'hummingbird', 'koala', 'lion', 'monkey', 'mouse', 'owl',
  'ox', 'panda', 'pig', 'rabbit', 'seagull', 'sheep', 'snake',
]

export const generateFriendlyUsername = (): string => {
  const color = COLORS[Math.floor(Math.random() * COLORS.length)]
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)]
  return `${color}${animal}`
}

// Register a random Lightning address
export const registerRandomAddress = async (): Promise<string> => {
  if (!wallet) throw new Error('Wallet not connected')

  for (let attempt = 0; attempt < 5; attempt++) {
    const username = generateRandomUsername()
    try {
      console.log(`[wallet] Attempt ${attempt + 1}: checking username "${username}"`)
      const available = await wallet.sdk.checkLightningAddressAvailable({ username })
      if (available) {
        console.log(`[wallet] Registering "${username}"`)
        const result = await wallet.sdk.registerLightningAddress({
          username,
          description: `Pay to ${username}@breez.cash`,
        })
        wallet.lightningAddress = result.lightningAddress
        console.log(`[wallet] Registered ${result.lightningAddress}`)
        return result.lightningAddress
      }
      console.log(`[wallet] "${username}" not available`)
    } catch (err) {
      console.error(`[wallet] Attempt ${attempt + 1} failed:`, err)
    }
  }
  throw new Error('Failed to register Lightning address after 5 attempts')
}

// Get the wallet's Lightning address
export const getAddress = (): string | null => {
  return wallet?.lightningAddress ?? null
}

// Get wallet balance
export const getBalance = async (): Promise<number> => {
  if (!wallet) return 0
  try {
    const info = await wallet.sdk.getInfo({ ensureSynced: true })
    return Number(info.balanceSats)
  } catch {
    return 0
  }
}

// Get wallet info
export const getWalletInfo = async (): Promise<breezSdk.GetInfoResponse | null> => {
  if (!wallet) return null
  return await wallet.sdk.getInfo({ ensureSynced: true })
}

export const getLightningAddress = async (): Promise<breezSdk.LightningAddressInfo | null> => {
  if (!wallet) return null
  return await wallet.sdk.getLightningAddress() ?? null
}

export const checkLightningAddressAvailable = async (username: string): Promise<boolean> => {
  if (!wallet) throw new Error('Wallet not connected')
  return await wallet.sdk.checkLightningAddressAvailable({ username })
}

export const registerLightningAddress = async (username: string, description: string): Promise<void> => {
  if (!wallet) throw new Error('Wallet not connected')
  const result = await wallet.sdk.registerLightningAddress({ username, description })
  wallet.lightningAddress = result.lightningAddress
}

export const addEventListener = async (callback: (event: breezSdk.SdkEvent) => void): Promise<string> => {
  if (!wallet) throw new Error('SDK not initialized')
  const listener: EventListener = { onEvent: callback }
  return await wallet.sdk.addEventListener(listener)
}

export const removeEventListener = async (listenerId: string): Promise<void> => {
  if (!wallet) return
  await wallet.sdk.removeEventListener(listenerId)
}

export const disconnect = async (): Promise<void> => {
  if (wallet) {
    await wallet.sdk.disconnect().catch(() => {})
    wallet = null
  }
}

export const connected = (): boolean => wallet !== null

export const saveMnemonic = (mnemonic: string): void => {
  localStorage.setItem('glowpay_mnemonic', mnemonic)
}

export const getSavedMnemonic = (): string | null => {
  return localStorage.getItem('glowpay_mnemonic')
}

export const clearMnemonic = (): void => {
  localStorage.removeItem('glowpay_mnemonic')
}

// Sweep all funds to a destination Lightning address
export interface SweepResult {
  balanceSats: number
  success: boolean
  error?: string
}

export const sweepAllFunds = async (
  destination: string,
  onProgress?: (msg: string) => void,
): Promise<SweepResult> => {
  if (!wallet) throw new Error('Wallet not initialized')

  onProgress?.('Checking balance...')
  const balanceSats = await getBalance()

  if (balanceSats === 0) {
    throw new Error('No funds to sweep')
  }

  onProgress?.('Resolving destination...')
  const parsed = await wallet.sdk.parse(destination)

  let lnurlPayRequest: breezSdk.LnurlPayRequestDetails
  if (parsed.type === 'lightningAddress') {
    lnurlPayRequest = (parsed as breezSdk.LightningAddressDetails & { type: string }).payRequest
  } else if (parsed.type === 'lnurlPay') {
    const { type: _type, ...rest } = parsed
    lnurlPayRequest = rest as breezSdk.LnurlPayRequestDetails
  } else {
    throw new Error('Destination must be a Lightning address (e.g. you@wallet.com)')
  }

  onProgress?.(`Sweeping ${balanceSats} sats...`)

  try {
    const prepareResponse = await wallet.sdk.prepareLnurlPay({
      amountSats: balanceSats,
      payRequest: lnurlPayRequest,
      feePolicy: 'feesIncluded',
    })
    await wallet.sdk.lnurlPay({ prepareResponse })
    return { balanceSats, success: true }
  } catch (err) {
    return {
      balanceSats,
      success: false,
      error: err instanceof Error ? err.message : 'Send failed',
    }
  }
}

// Backward compat aliases
export const initWalletPool = initWallet
