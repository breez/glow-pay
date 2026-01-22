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

interface WalletContextValue {
  isConnecting: boolean
  isConnected: boolean
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
  const [walletInfo, setWalletInfo] = useState<breezSdk.GetInfoResponse | null>(null)
  const [lightningAddress, setLightningAddress] = useState<breezSdk.LightningAddressInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const eventListenerIdRef = useRef<string | null>(null)

  useEffect(() => {
    const savedMnemonic = getSavedMnemonic()
    if (savedMnemonic) {
      connectWithMnemonic(savedMnemonic).catch(() => clearMnemonic())
    }
  }, [])

  const handleSdkEvent = useCallback(async (event: breezSdk.SdkEvent) => {
    if (event.type === 'synced' || event.type === 'paymentSucceeded') {
      const info = await getWalletInfo()
      setWalletInfo(info)
    }
  }, [])

  useEffect(() => {
    if (isConnected && !eventListenerIdRef.current) {
      addEventListener(handleSdkEvent).then(id => {
        eventListenerIdRef.current = id
      }).catch(() => {})
    }
    return () => {
      if (eventListenerIdRef.current) {
        removeEventListener(eventListenerIdRef.current).catch(() => {})
        eventListenerIdRef.current = null
      }
    }
  }, [isConnected, handleSdkEvent])

  const connectWithMnemonic = async (mnemonic: string) => {
    if (connected()) return
    setIsConnecting(true)
    setError(null)
    try {
      await initWallet(mnemonic, 'mainnet')
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
