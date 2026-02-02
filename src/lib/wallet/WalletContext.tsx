import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react'
import * as bip39 from 'bip39'
import * as breezSdk from '@breeztech/breez-sdk-spark'
import {
  initWallet,
  getWalletInfo,
  disconnect,
  connected,
  saveMnemonic,
  getSavedMnemonic,
  clearMnemonic,
  getLightningAddress,
  checkLightningAddressAvailable,
  registerLightningAddress,
  addEventListener,
  removeEventListener,
} from './walletService'

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
}

const WalletContext = createContext<WalletContextValue | null>(null)

export function WalletProvider({ children }: { children: ReactNode }) {
  const [isConnecting, setIsConnecting] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [walletInfo, setWalletInfo] = useState<breezSdk.GetInfoResponse | null>(null)
  const [lightningAddress, setLightningAddress] = useState<breezSdk.LightningAddressInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const eventListenerIdRef = useRef<string | null>(null)
  const reconnectAttemptRef = useRef(0)
  const isRestoringRef = useRef(false)

  useEffect(() => {
    const savedMnemonic = getSavedMnemonic()
    if (savedMnemonic) {
      reconnectWithRetry(savedMnemonic)
    }
  }, [])

  const reconnectWithRetry = async (mnemonic: string) => {
    reconnectAttemptRef.current = 0
    isRestoringRef.current = true
    setIsSyncing(true)

    const attempt = async (): Promise<void> => {
      try {
        await connectWithMnemonic(mnemonic)
        reconnectAttemptRef.current = 0
        // Keep isSyncing true until we receive the 'synced' event
      } catch (err) {
        reconnectAttemptRef.current++
        console.warn(`Wallet reconnection attempt ${reconnectAttemptRef.current} failed:`, err)

        if (reconnectAttemptRef.current < MAX_RECONNECT_ATTEMPTS) {
          await new Promise(resolve => setTimeout(resolve, RECONNECT_DELAY_MS))
          return attempt()
        }

        // After all retries failed, don't clear mnemonic - just log the error
        // The user can manually retry or the app can retry on next load
        console.error('Wallet reconnection failed after all attempts. Mnemonic preserved for next attempt.')
        setError('Failed to connect wallet. Please check your connection and refresh the page.')
        isRestoringRef.current = false
        setIsSyncing(false)
      }
    }

    await attempt()
  }

  const handleSdkEvent = useCallback(async (event: breezSdk.SdkEvent) => {
    if (event.type === 'synced') {
      console.log('Wallet synced event received')
      // Mark sync complete if we were restoring
      if (isRestoringRef.current) {
        isRestoringRef.current = false
        setIsSyncing(false)
      }
      // Refresh wallet data after sync
      const info = await getWalletInfo()
      setWalletInfo(info)
      const addr = await getLightningAddress()
      setLightningAddress(addr)
    } else if (event.type === 'paymentSucceeded') {
      const info = await getWalletInfo()
      setWalletInfo(info)
    }
  }, [])

  // Cleanup event listener on unmount
  useEffect(() => {
    return () => {
      if (eventListenerIdRef.current) {
        removeEventListener(eventListenerIdRef.current).catch(() => {})
        eventListenerIdRef.current = null
      }
    }
  }, [])

  const connectWithMnemonic = async (mnemonic: string) => {
    if (connected()) return
    setIsConnecting(true)
    setError(null)
    try {
      await initWallet(mnemonic, 'mainnet')

      // Set up event listener IMMEDIATELY after SDK init, before setting isConnected
      // This prevents race condition where 'synced' event fires before listener is ready
      if (!eventListenerIdRef.current) {
        try {
          const listenerId = await addEventListener(handleSdkEvent)
          eventListenerIdRef.current = listenerId
          console.log('Event listener registered:', listenerId)
        } catch (e) {
          console.warn('Failed to add event listener:', e)
        }
      }

      setIsConnected(true)
      setWalletInfo(await getWalletInfo())
      setLightningAddress(await getLightningAddress())
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
    await disconnect()
    clearMnemonic()
    setIsConnected(false)
    setWalletInfo(null)
    setLightningAddress(null)
  }, [])

  const refreshWalletInfo = useCallback(async () => {
    if (!connected()) return
    setWalletInfo(await getWalletInfo())
  }, [])

  const refreshLightningAddress = useCallback(async () => {
    if (!connected()) return
    setLightningAddress(await getLightningAddress())
  }, [])

  const checkUsernameAvailable = useCallback(async (username: string) => {
    return await checkLightningAddressAvailable(username)
  }, [])

  const setLightningUsername = useCallback(async (username: string) => {
    await registerLightningAddress(username, `Pay to ${username}@breez.cash`)
    setLightningAddress(await getLightningAddress())
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
