import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import * as bip39 from 'bip39'
import * as breezSdk from '@breeztech/breez-sdk-spark'
import {
  initWalletPool,
  getWalletInfo,
  disconnect,
  connected,
  saveMnemonic,
  getSavedMnemonic,
  clearMnemonic,
  getLightningAddress,
  checkLightningAddressAvailable,
  registerLightningAddressForAccount,
  addEventListenerToAll,
  removeEventListenerFromAll,
  getAggregateBalance,
  getAllLightningAddresses,
  refreshAllAddresses,
  selectAddress,
  sweepToAccount,
  POOL_SIZE,
} from './walletService'
import type { AggregateBalance } from './walletService'

const MAX_RECONNECT_ATTEMPTS = 3
const RECONNECT_DELAY_MS = 2000

interface WalletContextValue {
  isConnecting: boolean
  isConnected: boolean
  isSyncing: boolean
  walletInfo: breezSdk.GetInfoResponse | null
  lightningAddress: breezSdk.LightningAddressInfo | null
  error: string | null
  generateMnemonic: () => string
  createWallet: (mnemonic: string) => Promise<void>
  restoreWallet: (mnemonic: string) => Promise<void>
  disconnectWallet: () => Promise<void>
  refreshWalletInfo: () => Promise<void>
  refreshLightningAddress: () => Promise<void>
  checkUsernameAvailable: (username: string) => Promise<boolean>
  setLightningUsername: (username: string) => Promise<void>
  clearError: () => void
  // Multi-wallet
  poolSyncProgress: number
  aggregateBalance: AggregateBalance | null
  allLightningAddresses: string[]
  selectPaymentAddress: () => { address: string; accountIndex: number }
  refreshAggregateBalance: () => Promise<void>
  registerAllAddresses: (baseUsername: string) => Promise<string[]>
  sweepFunds: (targetAccount: number) => Promise<void>
}

const WalletContext = createContext<WalletContextValue | null>(null)

// Generate a random 3-char suffix for rotation usernames
function randomSuffix(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < 3; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [isConnecting, setIsConnecting] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [walletInfo, setWalletInfo] = useState<breezSdk.GetInfoResponse | null>(null)
  const [lightningAddress, setLightningAddress] = useState<breezSdk.LightningAddressInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [poolSyncProgress, setPoolSyncProgress] = useState(0)
  const [aggregateBalance, setAggregateBalance] = useState<AggregateBalance | null>(null)
  const [allLightningAddresses, setAllLightningAddresses] = useState<string[]>([])

  const eventListenerIdsRef = useRef<string[]>([])
  const reconnectAttemptRef = useRef(0)
  const isRestoringRef = useRef(false)
  const syncedAccountsRef = useRef<Set<number>>(new Set())

  useEffect(() => {
    const savedMnemonic = getSavedMnemonic()
    if (savedMnemonic) {
      reconnectWithRetry(savedMnemonic)
    }
  }, [])

  const reconnectWithRetry = async (mnemonic: string) => {
    reconnectAttemptRef.current = 0
    isRestoringRef.current = true
    syncedAccountsRef.current = new Set()
    setPoolSyncProgress(0)
    setIsSyncing(true)

    const attempt = async (): Promise<void> => {
      try {
        await connectWithMnemonic(mnemonic)
        reconnectAttemptRef.current = 0
      } catch (err) {
        reconnectAttemptRef.current++
        console.warn(`Wallet reconnection attempt ${reconnectAttemptRef.current} failed:`, err)

        if (reconnectAttemptRef.current < MAX_RECONNECT_ATTEMPTS) {
          await new Promise(resolve => setTimeout(resolve, RECONNECT_DELAY_MS))
          return attempt()
        }

        console.error('Wallet reconnection failed after all attempts. Mnemonic preserved for next attempt.')
        setError('Failed to connect wallet. Please check your connection and refresh the page.')
        isRestoringRef.current = false
        setIsSyncing(false)
      }
    }

    await attempt()
  }

  const handlePoolEvent = useCallback(async (event: breezSdk.SdkEvent, accountNumber: number) => {
    if (event.type === 'synced') {
      console.log(`Wallet account ${accountNumber} synced`)
      syncedAccountsRef.current.add(accountNumber)
      setPoolSyncProgress(syncedAccountsRef.current.size)

      // All wallets synced
      if (syncedAccountsRef.current.size >= POOL_SIZE) {
        if (isRestoringRef.current) {
          isRestoringRef.current = false
          setIsSyncing(false)
        }
        // Refresh all data
        const info = await getWalletInfo()
        setWalletInfo(info)
        const addr = await getLightningAddress()
        setLightningAddress(addr)
        setAllLightningAddresses(getAllLightningAddresses())
        const balance = await getAggregateBalance()
        setAggregateBalance(balance)
      }
    } else if (event.type === 'paymentSucceeded') {
      // Refresh balances on any payment
      const info = await getWalletInfo()
      setWalletInfo(info)
      const balance = await getAggregateBalance()
      setAggregateBalance(balance)
    }
  }, [])

  // Cleanup event listeners on unmount
  useEffect(() => {
    return () => {
      if (eventListenerIdsRef.current.length > 0) {
        removeEventListenerFromAll(eventListenerIdsRef.current).catch(() => {})
        eventListenerIdsRef.current = []
      }
    }
  }, [])

  const connectWithMnemonic = async (mnemonic: string) => {
    if (connected()) return
    setIsConnecting(true)
    setError(null)
    syncedAccountsRef.current = new Set()
    setPoolSyncProgress(0)
    try {
      await initWalletPool(mnemonic, 'mainnet')

      // Set up event listeners on all instances
      if (eventListenerIdsRef.current.length === 0) {
        try {
          const listenerIds = await addEventListenerToAll(handlePoolEvent)
          eventListenerIdsRef.current = listenerIds
          console.log('Event listeners registered on all wallet instances')
        } catch (e) {
          console.warn('Failed to add event listeners:', e)
        }
      }

      setIsConnected(true)
      setWalletInfo(await getWalletInfo())
      setLightningAddress(await getLightningAddress())
      setAllLightningAddresses(getAllLightningAddresses())
      setAggregateBalance(await getAggregateBalance())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect wallet')
      throw err
    } finally {
      setIsConnecting(false)
    }
  }

  const generateMnemonic = useCallback(() => bip39.generateMnemonic(128), [])

  const createWallet = useCallback(async (mnemonic: string) => {
    await connectWithMnemonic(mnemonic)
    saveMnemonic(mnemonic)
  }, [])

  const restoreWallet = useCallback(async (mnemonic: string) => {
    if (!bip39.validateMnemonic(mnemonic)) throw new Error('Invalid recovery phrase')
    await connectWithMnemonic(mnemonic)
    saveMnemonic(mnemonic)
  }, [])

  const disconnectWallet = useCallback(async () => {
    if (eventListenerIdsRef.current.length > 0) {
      await removeEventListenerFromAll(eventListenerIdsRef.current).catch(() => {})
      eventListenerIdsRef.current = []
    }
    await disconnect()
    clearMnemonic()
    setIsConnected(false)
    setWalletInfo(null)
    setLightningAddress(null)
    setAggregateBalance(null)
    setAllLightningAddresses([])
    setPoolSyncProgress(0)
  }, [])

  const refreshWalletInfo = useCallback(async () => {
    if (!connected()) return
    setWalletInfo(await getWalletInfo())
    setAggregateBalance(await getAggregateBalance())
  }, [])

  const refreshLightningAddress = useCallback(async () => {
    if (!connected()) return
    setLightningAddress(await getLightningAddress())
    await refreshAllAddresses()
    setAllLightningAddresses(getAllLightningAddresses())
  }, [])

  const checkUsernameAvailable = useCallback(async (username: string) => {
    return await checkLightningAddressAvailable(username)
  }, [])

  const setLightningUsername = useCallback(async (username: string) => {
    await registerLightningAddressForAccount(0, username, `Pay to ${username}@breez.cash`)
    setLightningAddress(await getLightningAddress())
  }, [])

  const selectPaymentAddress = useCallback(() => {
    return selectAddress()
  }, [])

  const refreshAggregateBalance = useCallback(async () => {
    if (!connected()) return
    setAggregateBalance(await getAggregateBalance())
  }, [])

  const registerAllAddresses = useCallback(async (baseUsername: string): Promise<string[]> => {
    const addresses: string[] = []

    // Account 0: use the base username (already registered by setLightningUsername)
    const addr0 = getAllLightningAddresses()[0]
    if (addr0) {
      addresses.push(addr0)
    } else {
      const result = await registerLightningAddressForAccount(0, baseUsername, `Pay to ${baseUsername}@breez.cash`)
      addresses.push(result.lightningAddress)
    }

    // Accounts 1-4: derived usernames with random suffix
    for (let i = 1; i < POOL_SIZE; i++) {
      let registered = false
      let attempts = 0

      while (!registered && attempts < 5) {
        const suffix = randomSuffix()
        const derivedUsername = `${baseUsername}_${suffix}`
        try {
          const result = await registerLightningAddressForAccount(
            i,
            derivedUsername,
            `Pay to ${derivedUsername}@breez.cash`
          )
          addresses.push(result.lightningAddress)
          registered = true
        } catch {
          attempts++
          console.warn(`Username ${derivedUsername} failed, retrying (attempt ${attempts})`)
        }
      }

      if (!registered) {
        throw new Error(`Failed to register Lightning address for account ${i} after 5 attempts`)
      }
    }

    await refreshAllAddresses()
    setAllLightningAddresses(getAllLightningAddresses())
    return addresses
  }, [])

  const sweepFunds = useCallback(async (targetAccount: number) => {
    await sweepToAccount(targetAccount)
    setAggregateBalance(await getAggregateBalance())
    setWalletInfo(await getWalletInfo())
  }, [])

  return (
    <WalletContext.Provider value={{
      isConnecting,
      isConnected,
      isSyncing,
      walletInfo,
      lightningAddress,
      error,
      generateMnemonic,
      createWallet,
      restoreWallet,
      disconnectWallet,
      refreshWalletInfo,
      refreshLightningAddress,
      checkUsernameAvailable,
      setLightningUsername,
      clearError: () => setError(null),
      // Multi-wallet
      poolSyncProgress,
      aggregateBalance,
      allLightningAddresses,
      selectPaymentAddress,
      refreshAggregateBalance,
      registerAllAddresses,
      sweepFunds,
    }}>
      {children}
    </WalletContext.Provider>
  )
}

export function useWallet() {
  const context = useContext(WalletContext)
  if (!context) throw new Error('useWallet must be used within a WalletProvider')
  return context
}
