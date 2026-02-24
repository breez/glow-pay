import * as breezSdk from '@breeztech/breez-sdk-spark'
import { isWasmInitialized } from './wasmLoader'
import { getAddressUsage, updateAddressUsage } from '../store'

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

export const MAX_POOL_SIZE = 10 // 10 random addresses

export interface WalletInstance {
  sdk: breezSdk.BreezSdk
  accountNumber: number
  lightningAddress: string | null
}

export interface AggregateBalance {
  totalBalanceSats: number
  perWallet: Array<{
    accountNumber: number
    balanceSats: number
    address: string | null
  }>
}

let walletPool: WalletInstance[] = []
let logger: WebLogger | null = null

const API_KEY = 'MIIBazCCAR2gAwIBAgIHPdG0GExEwzAFBgMrZXAwEDEOMAwGA1UEAxMFQnJlZXowHhcNMjUwMjIwMTIyODIxWhcNMzUwMjE4MTIyODIxWjAnMQ0wCwYDVQQKEwRUZXN0MRYwFAYDVQQDEw1Sb3kgU2hlaW5mZWxkMCowBQYDK2VwAyEA0IP1y98gPByiIMoph1P0G6cctLb864rNXw1LRLOpXXejfzB9MA4GA1UdDwEB/wQEAwIFoDAMBgNVHRMBAf8EAjAAMB0GA1UdDgQWBBTaOaPuXmtLDTJVv++VYBiQr9gHCTAfBgNVHSMEGDAWgBTeqtaSVvON53SSFvxMtiCyayiYazAdBgNVHREEFjAUgRJraW5nb25seUBnbWFpbC5jb20wBQYDK2VwA0EAINTIeR5+LrLIngPjGFrBrPzdRv4yN8kjNgRVdFDoa1fZPlynm4GjKoTGg8sHxEcRKP1QN2YP0s6NSDT3C+MIDw=='

const connectOneWallet = async (i: number, network: breezSdk.Network, mnemonic: string): Promise<WalletInstance> => {
  const config = breezSdk.defaultConfig(network)
  config.apiKey = API_KEY
  config.privateEnabledDefault = false
  config.lnurlDomain = 'breez.cash'

  const keySetConfig: breezSdk.KeySetConfig = {
    keySetType: 'default',
    useAddressIndex: false,
    accountNumber: i,
  }

  const signer = breezSdk.defaultExternalSigner(mnemonic, null, network, keySetConfig)
  const sdk = await breezSdk.connectWithSigner(config, signer, `glow-pay-wallet-${i}`)

  // Enable public mode for LNURL-verify
  await sdk.updateUserSettings({ sparkPrivateModeEnabled: false }).catch(() => {})

  const addrInfo = await sdk.getLightningAddress().catch(() => undefined)

  console.log(`Wallet account ${i} connected${addrInfo ? ` (${addrInfo.lightningAddress})` : ''}`)

  return {
    sdk,
    accountNumber: i,
    lightningAddress: addrInfo?.lightningAddress ?? null,
  }
}

let savedMnemonicRef: string | null = null
let savedNetworkRef: breezSdk.Network = 'mainnet'

export const initWalletPool = async (mnemonic: string, network: breezSdk.Network = 'mainnet', poolSize: number = 10): Promise<void> => {
  if (walletPool.length > 0) return

  if (!isWasmInitialized()) {
    throw new Error('WASM module not initialized. Please refresh the page.')
  }

  if (!logger) {
    logger = new WebLogger()
    breezSdk.initLogging(logger)
  }

  savedMnemonicRef = mnemonic
  savedNetworkRef = network

  const size = Math.min(Math.max(poolSize, 1), MAX_POOL_SIZE)
  const indices = Array.from({ length: size }, (_, i) => i)
  const instances = await Promise.all(indices.map(i => connectOneWallet(i, network, mnemonic)))

  instances.sort((a, b) => a.accountNumber - b.accountNumber)
  walletPool = instances
}

// Expand pool by adding more wallet instances (for rotation)
export const expandWalletPool = async (targetSize: number): Promise<void> => {
  if (!savedMnemonicRef) throw new Error('Wallet pool not initialized')
  const size = Math.min(Math.max(targetSize, 1), MAX_POOL_SIZE)
  const existingNums = new Set(walletPool.map(w => w.accountNumber))
  const newIndices: number[] = []
  for (let i = 0; i < size; i++) {
    if (!existingNums.has(i)) newIndices.push(i)
  }
  if (newIndices.length === 0) return

  const newInstances = await Promise.all(
    newIndices.map(i => connectOneWallet(i, savedNetworkRef, savedMnemonicRef!))
  )
  walletPool = [...walletPool, ...newInstances].sort((a, b) => a.accountNumber - b.accountNumber)
}

// Generate a random 8-char lowercase username (for rotation addresses)
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

// Register a random address on a specific account (for rotation)
export const registerRandomAddressForAccount = async (
  accountNumber: number
): Promise<string> => {
  const instance = walletPool.find(w => w.accountNumber === accountNumber)
  if (!instance) throw new Error(`Wallet account ${accountNumber} not connected`)

  for (let attempt = 0; attempt < 5; attempt++) {
    const username = generateRandomUsername()
    try {
      const available = await instance.sdk.checkLightningAddressAvailable({ username })
      if (available) {
        const result = await instance.sdk.registerLightningAddress({
          username,
          description: `Pay to ${username}@breez.cash`,
        })
        instance.lightningAddress = result.lightningAddress
        return result.lightningAddress
      }
    } catch {
      // try next
    }
  }
  throw new Error(`Failed to register random address for account ${accountNumber} after 5 attempts`)
}

// Address rotation: weighted-random favoring least-recently-used
// Uses first `rotationCount` addresses (accounts 0..rotationCount-1)
export const selectAddress = (rotationCount?: number): { address: string; accountIndex: number } => {
  let candidates = walletPool
    .filter(w => w.lightningAddress !== null)
    .map(w => ({ address: w.lightningAddress!, accountIndex: w.accountNumber }))

  // Limit to first N addresses if rotationCount is set
  if (rotationCount !== undefined && rotationCount > 0) {
    candidates = candidates.filter(a => a.accountIndex < rotationCount)
  }

  if (candidates.length === 0) {
    throw new Error('No Lightning addresses registered')
  }

  // If only one address, return it directly
  if (candidates.length === 1) {
    updateAddressUsage(candidates[0].accountIndex)
    return candidates[0]
  }

  const addressesWithIndex = candidates

  const usage = getAddressUsage()

  // Sort by last used (ascending — least recent first)
  const sorted = [...addressesWithIndex].sort((a, b) => {
    const aUsage = usage[a.accountIndex] ?? 0
    const bUsage = usage[b.accountIndex] ?? 0
    return aUsage - bUsage
  })

  // Assign weights: first in sorted order (least recent) gets highest weight
  const weights = sorted.map((_, i) => sorted.length - i)
  const totalWeight = weights.reduce((sum, w) => sum + w, 0)

  let random = Math.random() * totalWeight
  for (let i = 0; i < sorted.length; i++) {
    random -= weights[i]
    if (random <= 0) {
      updateAddressUsage(sorted[i].accountIndex)
      return sorted[i]
    }
  }

  // Fallback (shouldn't reach here)
  const fallback = sorted[0]
  updateAddressUsage(fallback.accountIndex)
  return fallback
}

// Aggregate balance across all wallets
export const getAggregateBalance = async (): Promise<AggregateBalance> => {
  const perWallet: AggregateBalance['perWallet'] = []
  let totalBalanceSats = 0

  for (const instance of walletPool) {
    try {
      await instance.sdk.syncWallet({})
      const info = await instance.sdk.getInfo({})
      perWallet.push({
        accountNumber: instance.accountNumber,
        balanceSats: info.balanceSats,
        address: instance.lightningAddress,
      })
      totalBalanceSats += info.balanceSats
    } catch {
      perWallet.push({
        accountNumber: instance.accountNumber,
        balanceSats: 0,
        address: instance.lightningAddress,
      })
    }
  }

  return { totalBalanceSats, perWallet }
}

// Get all registered Lightning addresses
export const getAllLightningAddresses = (): string[] => {
  return walletPool
    .map(w => w.lightningAddress)
    .filter((addr): addr is string => addr !== null)
}

// Refresh addresses from SDK (after registration)
export const refreshAllAddresses = async (): Promise<void> => {
  for (const instance of walletPool) {
    try {
      const addrInfo = await instance.sdk.getLightningAddress()
      instance.lightningAddress = addrInfo?.lightningAddress ?? null
    } catch {
      // keep existing
    }
  }
}

// Register Lightning address on a specific account
export const registerLightningAddressForAccount = async (
  accountNumber: number,
  username: string,
  description: string
): Promise<breezSdk.LightningAddressInfo> => {
  const instance = walletPool.find(w => w.accountNumber === accountNumber)
  if (!instance) throw new Error(`Wallet account ${accountNumber} not connected`)

  const result = await instance.sdk.registerLightningAddress({ username, description })
  instance.lightningAddress = result.lightningAddress
  return result
}

// Check username availability on a specific account
export const checkLightningAddressAvailableOnAccount = async (
  accountNumber: number,
  username: string
): Promise<boolean> => {
  const instance = walletPool.find(w => w.accountNumber === accountNumber)
  if (!instance) throw new Error(`Wallet account ${accountNumber} not connected`)
  return await instance.sdk.checkLightningAddressAvailable({ username })
}

// Add event listener to all wallet instances
export const addEventListenerToAll = async (
  callback: (event: breezSdk.SdkEvent, accountNumber: number) => void
): Promise<string[]> => {
  const listenerIds: string[] = []

  for (const instance of walletPool) {
    const accountNum = instance.accountNumber
    const listener: EventListener = {
      onEvent: (event) => callback(event, accountNum),
    }
    const id = await instance.sdk.addEventListener(listener)
    listenerIds.push(id)
  }

  return listenerIds
}

// Remove event listeners from all instances
export const removeEventListenerFromAll = async (listenerIds: string[]): Promise<void> => {
  for (let i = 0; i < Math.min(listenerIds.length, walletPool.length); i++) {
    await walletPool[i].sdk.removeEventListener(listenerIds[i]).catch(() => {})
  }
}

// Disconnect all wallet instances
export const disconnectAll = async (): Promise<void> => {
  for (const instance of walletPool) {
    await instance.sdk.disconnect().catch(() => {})
  }
  walletPool = []
}

// Check if all wallets are connected (at least primary)
export const allConnected = (): boolean => walletPool.length > 0

// Get current pool size
export const getPoolSize = (): number => walletPool.length

// Check if any wallet is connected (for basic operations)
export const connected = (): boolean => walletPool.length > 0

// Get wallet info for a specific account
export const getWalletInfoForAccount = async (accountNumber: number): Promise<breezSdk.GetInfoResponse | null> => {
  const instance = walletPool.find(w => w.accountNumber === accountNumber)
  if (!instance) return null
  return await instance.sdk.getInfo({})
}

// --- Backward-compatible functions (delegate to account 0) ---

export const getWalletInfo = async (): Promise<breezSdk.GetInfoResponse | null> => {
  return getWalletInfoForAccount(0)
}

export const getLightningAddress = async (): Promise<breezSdk.LightningAddressInfo | null> => {
  const instance = walletPool.find(w => w.accountNumber === 0)
  if (!instance) return null
  return await instance.sdk.getLightningAddress() ?? null
}

export const checkLightningAddressAvailable = async (username: string): Promise<boolean> => {
  return checkLightningAddressAvailableOnAccount(0, username)
}

export const registerLightningAddress = async (username: string, description: string): Promise<void> => {
  await registerLightningAddressForAccount(0, username, description)
}

export const addEventListener = async (callback: (event: breezSdk.SdkEvent) => void): Promise<string> => {
  const instance = walletPool.find(w => w.accountNumber === 0)
  if (!instance) throw new Error('SDK not initialized')
  const listener: EventListener = { onEvent: callback }
  return await instance.sdk.addEventListener(listener)
}

export const removeEventListener = async (listenerId: string): Promise<void> => {
  const instance = walletPool.find(w => w.accountNumber === 0)
  if (!instance) return
  await instance.sdk.removeEventListener(listenerId)
}

export const disconnect = async (): Promise<void> => {
  await disconnectAll()
}

export const saveMnemonic = (mnemonic: string): void => {
  localStorage.setItem('glowpay_mnemonic', mnemonic)
}

export const getSavedMnemonic = (): string | null => {
  return localStorage.getItem('glowpay_mnemonic')
}

export const clearMnemonic = (): void => {
  localStorage.removeItem('glowpay_mnemonic')
}

// Keep old initWallet as alias for backward compat
export const initWallet = initWalletPool
