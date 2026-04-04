import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { ShoppingCart, Loader2, Zap, ChevronDown, AlertCircle, MoreVertical, Upload, Download } from 'lucide-react'
import { getPOSMerchantInfo, createPOSCharge } from '@/lib/api-client'
import { formatSats } from '@/lib/lnurl'
import { useExchangeRate, usdToSats, satsToUsd, formatUsd } from '@/lib/use-exchange-rate'
import { getPOSItems, getPOSSettings, savePOSSettings, setPOSItems } from '@/lib/pos-store'
import type { POSItem, CartItem } from '@/lib/pos-store'
import { exportItemsToCSV, downloadCSV, parseCSVToItems } from '@/lib/pos-csv'
import { POSKeypad } from './components/POSKeypad'
import { POSItems } from './components/POSItems'
import { POSCart } from './components/POSCart'
import { POSCharging } from './components/POSCharging'
import { POSReceipt } from './components/POSReceipt'

type Screen = 'loading' | 'error' | 'idle' | 'charging' | 'paid'
type Tab = 'keypad' | 'items'

interface MerchantInfo {
  storeName: string
  brandColor?: string | null
  brandBackground?: string | null
  logoUrl?: string | null
}

interface ChargeData {
  paymentId: string
  invoice: string
  expiresAt: string
  amountSats: number
  description: string | null
}

export function POSPage() {
  const { merchantId } = useParams<{ merchantId: string }>()
  const [screen, setScreen] = useState<Screen>('loading')
  const [error, setError] = useState<string | null>(null)
  const [merchant, setMerchant] = useState<MerchantInfo | null>(null)
  const [tab, setTab] = useState<Tab>(() => getPOSSettings().lastTab)
  const [currency, setCurrency] = useState<'SAT' | 'USD'>(() => getPOSSettings().currency)
  const [keypadValue, setKeypadValue] = useState('0')
  const [items, setItems] = useState<POSItem[]>(() => getPOSItems())
  const [cart, setCart] = useState<CartItem[]>([])
  const [cartOpen, setCartOpen] = useState(false)
  const [chargeData, setChargeData] = useState<ChargeData | null>(null)
  const [charging, setCharging] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [importToast, setImportToast] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { rate } = useExchangeRate()

  // Load merchant info
  useEffect(() => {
    if (!merchantId) {
      setError('Missing merchant ID')
      setScreen('error')
      return
    }

    getPOSMerchantInfo(merchantId).then(result => {
      if (result.success && result.data) {
        setMerchant(result.data)
        setScreen('idle')
      } else {
        setError(result.error || 'POS is not available')
        setScreen('error')
      }
    }).catch(() => {
      setError('Failed to load merchant info')
      setScreen('error')
    })
  }, [merchantId])

  // Persist settings
  useEffect(() => {
    savePOSSettings({ currency, lastTab: tab })
  }, [currency, tab])

  const reloadItems = useCallback(() => {
    setItems(getPOSItems())
  }, [])

  // Cart helpers
  const addToCart = useCallback((item: POSItem) => {
    setCart(prev => {
      const existing = prev.find(c => c.item.id === item.id)
      if (existing) {
        return prev.map(c => c.item.id === item.id ? { ...c, quantity: c.quantity + 1 } : c)
      }
      return [...prev, { item, quantity: 1 }]
    })
  }, [])

  const updateCartQuantity = useCallback((itemId: string, delta: number) => {
    setCart(prev => prev
      .map(c => c.item.id === itemId ? { ...c, quantity: c.quantity + delta } : c)
      .filter(c => c.quantity > 0)
    )
  }, [])

  const removeFromCart = useCallback((itemId: string) => {
    setCart(prev => prev.filter(c => c.item.id !== itemId))
  }, [])

  const clearCart = useCallback(() => setCart([]), [])

  // Total calculation
  const cartTotalSats = cart.reduce((sum, ci) => sum + ci.item.priceSats * ci.quantity, 0)
  const cartItemCount = cart.reduce((sum, ci) => sum + ci.quantity, 0)

  const getChargeAmountSats = (): number => {
    if (tab === 'items') return cartTotalSats
    const num = parseFloat(keypadValue)
    if (isNaN(num) || num <= 0) return 0
    if (currency === 'USD' && rate) return usdToSats(num, rate)
    return Math.round(num)
  }

  const chargeAmountSats = getChargeAmountSats()

  const formatChargeAmount = () => {
    if (chargeAmountSats === 0) return 'CHARGE'
    const satsStr = `${formatSats(chargeAmountSats)} SAT`
    if (currency === 'USD' && rate) {
      return `CHARGE $${formatUsd(satsToUsd(chargeAmountSats, rate))} (${satsStr})`
    }
    return `CHARGE ${satsStr}`
  }

  // Charge
  const handleCharge = async () => {
    if (!merchantId || chargeAmountSats < 1 || charging) return
    setCharging(true)

    const description = tab === 'items' && cart.length > 0
      ? cart.map(c => `${c.item.emoji} ${c.item.name} x${c.quantity}`).join(', ')
      : null

    const chargeItems = tab === 'items' && cart.length > 0
      ? cart.map(c => ({ name: c.item.name, quantity: c.quantity, priceSats: c.item.priceSats }))
      : undefined

    try {
      const result = await createPOSCharge(merchantId, chargeAmountSats, description || undefined, chargeItems)
      if (result.success && result.data) {
        setChargeData({
          paymentId: result.data.paymentId,
          invoice: result.data.invoice,
          expiresAt: result.data.expiresAt,
          amountSats: result.data.amountSats,
          description,
        })
        setScreen('charging')
      } else {
        setError(result.error || 'Failed to create charge')
      }
    } catch {
      setError('Failed to create charge')
    } finally {
      setCharging(false)
    }
  }

  const handlePaid = useCallback(() => {
    setScreen('paid')
  }, [])

  const handleCancelCharge = useCallback(() => {
    setScreen('idle')
    setChargeData(null)
  }, [])

  const handleNewSale = useCallback(() => {
    setScreen('idle')
    setChargeData(null)
    setKeypadValue('0')
    setCart([])
  }, [])

  const toggleCurrency = () => {
    setCurrency(prev => {
      if (prev === 'SAT') return rate ? 'USD' : 'SAT'
      return 'SAT'
    })
  }

  // CSV handlers
  const handleExport = () => {
    const csv = exportItemsToCSV(items)
    downloadCSV(csv, 'pos-items.csv')
    setMenuOpen(false)
  }

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      const csv = reader.result as string
      const result = parseCSVToItems(csv)
      if (result.items.length === 0) {
        setImportToast('No valid items found in CSV')
        setTimeout(() => setImportToast(null), 3000)
        return
      }
      const existing = getPOSItems()
      const merged = [...existing]
      for (const imported of result.items) {
        const idx = merged.findIndex(e => e.name.toLowerCase() === imported.name.toLowerCase())
        if (idx >= 0) {
          merged[idx] = { ...merged[idx], priceSats: imported.priceSats, emoji: imported.emoji, updatedAt: imported.updatedAt }
        } else {
          merged.push(imported)
        }
      }
      setPOSItems(merged)
      reloadItems()
      const msg = `Imported ${result.items.length} items` + (result.skipped > 0 ? `, ${result.skipped} skipped` : '')
      setImportToast(msg)
      setTimeout(() => setImportToast(null), 3000)
    }
    reader.readAsText(file)
    e.target.value = ''
    setMenuOpen(false)
  }

  // Loading
  if (screen === 'loading') {
    return (
      <div className="min-h-screen gradient-bg flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-glow-400" />
      </div>
    )
  }

  // Error
  if (screen === 'error') {
    return (
      <div className="min-h-screen gradient-bg flex items-center justify-center p-6">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <p className="text-lg font-semibold text-white mb-2">POS Unavailable</p>
          <p className="text-sm text-gray-400">{error}</p>
        </div>
      </div>
    )
  }

  // Charging
  if (screen === 'charging' && chargeData) {
    return (
      <POSCharging
        paymentId={chargeData.paymentId}
        invoice={chargeData.invoice}
        amountSats={chargeData.amountSats}
        expiresAt={chargeData.expiresAt}
        description={chargeData.description}
        currency={currency}
        rate={rate}
        onPaid={handlePaid}
        onCancel={handleCancelCharge}
      />
    )
  }

  // Paid / Receipt
  if (screen === 'paid' && chargeData) {
    return (
      <POSReceipt
        amountSats={chargeData.amountSats}
        paymentId={chargeData.paymentId}
        items={cart}
        storeName={merchant?.storeName || ''}
        currency={currency}
        rate={rate}
        onNewSale={handleNewSale}
      />
    )
  }

  const hasAmount = chargeAmountSats > 0

  // Main POS screen
  return (
    <div className="h-[100dvh] gradient-bg flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2.5">
          {merchant?.logoUrl ? (
            <img src={merchant.logoUrl} alt="" className="w-8 h-8 rounded-lg object-contain" />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-glow-400/15 flex items-center justify-center">
              <Zap className="w-4.5 h-4.5 text-glow-400" />
            </div>
          )}
          <span className="font-semibold text-white truncate max-w-[160px]">
            {merchant?.storeName || 'POS'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Currency toggle */}
          <button
            onClick={toggleCurrency}
            disabled={!rate}
            className="flex items-center gap-1 px-3 py-1.5 bg-surface-800/60 border border-white/[0.06] rounded-lg text-sm font-medium text-gray-300 hover:text-white disabled:text-gray-600 transition-colors"
          >
            {currency}
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          {/* Cart badge */}
          <button
            onClick={() => setCartOpen(true)}
            className="relative p-2 text-gray-400 hover:text-white transition-colors"
          >
            <ShoppingCart className="w-5 h-5" />
            {cartItemCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 bg-glow-400 text-surface-900 text-xs font-bold rounded-full flex items-center justify-center">
                {cartItemCount}
              </span>
            )}
          </button>
          {/* Overflow menu (Items tab) */}
          {tab === 'items' && (
            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="p-2 text-gray-400 hover:text-white transition-colors"
              >
                <MoreVertical className="w-5 h-5" />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-10 bg-surface-700 border border-white/[0.1] rounded-xl shadow-xl z-30 overflow-hidden w-44">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-2.5 px-4 py-3 text-sm text-gray-300 hover:bg-surface-600 w-full"
                    >
                      <Upload className="w-4 h-4" /> Import CSV
                    </button>
                    {items.length > 0 && (
                      <button
                        onClick={handleExport}
                        className="flex items-center gap-2.5 px-4 py-3 text-sm text-gray-300 hover:bg-surface-600 w-full"
                      >
                        <Download className="w-4 h-4" /> Export CSV
                      </button>
                    )}
                  </div>
                </>
              )}
              <input ref={fileInputRef} type="file" accept=".csv" onChange={handleImport} className="hidden" />
            </div>
          )}
        </div>
      </header>

      {/* Tab bar */}
      <div className="flex px-4 gap-1">
        <button
          onClick={() => setTab('keypad')}
          className={`flex-1 py-2.5 text-sm font-medium text-center rounded-t-lg transition-colors ${
            tab === 'keypad'
              ? 'text-glow-400 border-b-2 border-glow-400'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Keypad
        </button>
        <button
          onClick={() => setTab('items')}
          className={`flex-1 py-2.5 text-sm font-medium text-center rounded-t-lg transition-colors ${
            tab === 'items'
              ? 'text-glow-400 border-b-2 border-glow-400'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Items
        </button>
      </div>
      <div className="border-b border-white/[0.06]" />

      {/* Toasts */}
      {error && (
        <div className="mx-4 mt-3 bg-red-500/20 border border-red-500/30 rounded-xl p-3 text-sm text-red-400">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-300 hover:text-red-200">dismiss</button>
        </div>
      )}
      {importToast && (
        <div className="mx-4 mt-3 bg-green-500/20 border border-green-500/30 rounded-xl p-3 text-sm text-green-400">
          {importToast}
        </div>
      )}

      {/* Tab content */}
      <div className="flex-1 flex flex-col overflow-hidden pt-2 pb-20">
        {tab === 'keypad' ? (
          <POSKeypad value={keypadValue} onChange={setKeypadValue} currency={currency} />
        ) : (
          <POSItems
            items={items}
            onItemsChange={reloadItems}
            onAddToCart={addToCart}
            cart={cart}
            currency={currency}
            rate={rate}
          />
        )}
      </div>

      {/* Charge bar */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-surface-900/95 backdrop-blur-sm border-t border-white/[0.06]">
        <button
          onClick={handleCharge}
          disabled={!hasAmount || charging}
          className={`w-full py-3.5 font-bold rounded-xl transition-all text-sm flex items-center justify-center gap-2 ${
            hasAmount
              ? 'bg-glow-400 hover:bg-glow-300 active:bg-glow-500 active:scale-[0.98] text-surface-900 shadow-lg shadow-glow-400/20'
              : 'bg-surface-800 border border-white/[0.06] text-gray-600'
          }`}
        >
          {charging ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Zap className="w-4 h-4" />
          )}
          {formatChargeAmount()}
        </button>
      </div>

      {/* Cart drawer */}
      {cartOpen && (
        <POSCart
          items={cart}
          currency={currency}
          rate={rate}
          onUpdateQuantity={updateCartQuantity}
          onRemove={removeFromCart}
          onClear={clearCart}
          onClose={() => setCartOpen(false)}
        />
      )}
    </div>
  )
}
