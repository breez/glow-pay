import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import * as bip39 from 'bip39'
import * as breezSdk from '@breeztech/breez-sdk-spark'
import {
  initWallet,
  getWalletInfo,
  getBalance,
  disconnect,
  connected,
  saveMnemonic,
  getSavedMnemonic,
  clearMnemonic,
  getLightningAddress,
  removeEventListener as removeWalletEventListener,
  setEventCallback,
  getEarlyListenerId,
  sweepAllFunds,
} from './walletService'
import type { SweepResult } from './walletService'
import { savePayment, getMerchant } from '../store'

const MAX_RECONNECT_ATTEMPTS = 3
const RECONNECT_DELAY_MS = 2000

interface WalletContextValue {
  isConnecting: boolean
  isConnected: boolean
  isSyncing: boolean
  walletInfo: breezSdk.GetInfoResponse | null
  lightningAddress: breezSdk.LightningAddressInfo | null
  error: string | null
  balanceSats: number
  generateMnemonic: () => string
  createWallet: (mnemonic: string) => Promise<void>
  restoreWallet: (mnemonic: string) => Promise<void>
  disconnectWallet: () => Promise<void>
  refreshWalletInfo: () => Promise<void>
  refreshLightningAddress: () => Promise<void>
  clearError: () => void
  refreshBalance: () => Promise<void>
  sweepFunds: (destination: string, onProgress?: (msg: string) => void) => Promise<SweepResult>
}

const WalletContext = createContext<WalletContextValue | null>(null)

export function WalletProvider({ children }: { children: ReactNode }) {
  const [isConnecting, setIsConnecting] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [walletInfo, setWalletInfo] = useState<breezSdk.GetInfoResponse | null>(null)
  const [lightningAddress, setLightningAddress] = useState<breezSdk.LightningAddressInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [balanceSats, setBalanceSats] = useState(0)

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

  const handleEvent = useCallback(async (event: breezSdk.SdkEvent) => {
    if (event.type === 'synced') {
      console.log('Wallet synced')
      if (isRestoringRef.current) {
        isRestoringRef.current = false
        setIsSyncing(false)
      }
      const info = await getWalletInfo()
      setWalletInfo(info)
      const addr = await getLightningAddress()
      setLightningAddress(addr)
      const bal = await getBalance()
      setBalanceSats(bal)
    } else if (event.type === 'paymentSucceeded' || event.type === 'paymentPending') {
      const info = await getWalletInfo()
      setWalletInfo(info)
      const bal = await getBalance()
      setBalanceSats(bal)
    }
  }, [])

  // Cleanup event listener on unmount
  useEffect(() => {
    return () => {
      if (eventListenerIdRef.current) {
        removeWalletEventListener(eventListenerIdRef.current).catch(() => {})
        eventListenerIdRef.current = null
      }
    }
  }, [])

  const connectWithMnemonic = async (mnemonic: string) => {
    if (connected()) return
    setIsConnecting(true)
    setError(null)
    try {
      // Register event callback BEFORE connecting so listener is added
      // inside connectWallet immediately after SDK connects,
      // before any sync events can be missed
      setEventCallback(handleEvent)
      await initWallet(mnemonic, 'mainnet')

      // Capture listener ID that was registered during connection
      eventListenerIdRef.current = getEarlyListenerId()
      console.log(`Event listener registered: ${eventListenerIdRef.current}`)

      setIsConnected(true)
      setWalletInfo(await getWalletInfo())
      setLightningAddress(await getLightningAddress())
      setBalanceSats(await getBalance())
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
    if (eventListenerIdRef.current) {
      await removeWalletEventListener(eventListenerIdRef.current).catch(() => {})
      eventListenerIdRef.current = null
    }
    await disconnect()
    clearMnemonic()
    setIsConnected(false)
    setWalletInfo(null)
    setLightningAddress(null)
    setBalanceSats(0)
  }, [])

  const refreshWalletInfo = useCallback(async () => {
    if (!connected()) return
    setWalletInfo(await getWalletInfo())
    setBalanceSats(await getBalance())
  }, [])

  const refreshLightningAddress = useCallback(async () => {
    if (!connected()) return
    setLightningAddress(await getLightningAddress())
  }, [])

  const refreshBalance = useCallback(async () => {
    if (!connected()) return
    setBalanceSats(await getBalance())
  }, [])

  const sweepFunds = useCallback(async (destination: string, onProgress?: (msg: string) => void): Promise<SweepResult> => {
    if (!connected()) throw new Error('Wallet not connected')
    const result = await sweepAllFunds(destination, onProgress)
    // Record sweep in payment history
    if (result.success) {
      const merchant = getMerchant()
      const now = new Date().toISOString()
      savePayment({
        id: `sweep_${Date.now().toString(36)}`,
        merchantId: merchant?.id || '',
        amountMsats: result.balanceSats * 1000,
        amountSats: result.balanceSats,
        description: `Sweep to ${destination.length > 20 ? destination.slice(0, 20) + '...' : destination}`,
        invoice: null,
        verifyUrl: null,
        status: 'completed',
        type: 'sweep',
        metadata: null,
        createdAt: now,
        paidAt: now,
        expiresAt: now,
      })
    }
    // Refresh balance after sweep
    setBalanceSats(await getBalance())
    setWalletInfo(await getWalletInfo())
    return result
  }, [])

  return (
    <WalletContext.Provider value={{
      isConnecting,
      isConnected,
      isSyncing,
      walletInfo,
      lightningAddress,
      error,
      balanceSats,
      generateMnemonic,
      createWallet,
      restoreWallet,
      disconnectWallet,
      refreshWalletInfo,
      refreshLightningAddress,
      clearError: () => setError(null),
      refreshBalance,
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
