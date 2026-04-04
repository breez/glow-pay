import { useState } from 'react'
import { X, Minus, Plus } from 'lucide-react'
import type { POSItem } from '@/lib/pos-store'
import { createPOSItem, savePOSItem } from '@/lib/pos-store'
import { usdToSats } from '@/lib/use-exchange-rate'

const EMOJI_PRESETS = ['☕', '🍺', '🍕', '🌮', '🍔', '🥐', '🧁', '🥤', '🍷', '🎫', '👕', '📦']

interface POSItemFormProps {
  item: POSItem | null
  currency: 'SAT' | 'USD'
  rate: number | null
  onSave: () => void
  onClose: () => void
}

export function POSItemForm({ item, currency: initialCurrency, rate, onSave, onClose }: POSItemFormProps) {
  const [name, setName] = useState(item?.name || '')
  const [priceCurrency, setPriceCurrency] = useState<'SAT' | 'USD'>(
    item?.priceUsd ? 'USD' : initialCurrency
  )
  const [price, setPrice] = useState(() => {
    if (!item) return ''
    if (item.priceUsd && priceCurrency === 'USD') return item.priceUsd.toString()
    return item.priceSats.toString()
  })
  const [emoji, setEmoji] = useState(item?.emoji || '')
  const [sku, setSku] = useState(item?.sku || '')

  const priceStep = priceCurrency === 'USD' ? 0.5 : 100
  const priceNum = parseFloat(price) || 0

  const adjustPrice = (delta: number) => {
    const next = Math.max(0, priceNum + delta)
    setPrice(priceCurrency === 'USD' ? next.toFixed(2) : next.toString())
  }

  const handlePriceInput = (val: string) => {
    // Allow digits, single decimal point
    if (val === '' || /^\d*\.?\d*$/.test(val)) {
      setPrice(val)
    }
  }

  const togglePriceCurrency = () => {
    if (!rate) return
    const num = parseFloat(price) || 0
    if (priceCurrency === 'SAT') {
      // Convert sats to USD
      const usd = (num / 100_000_000) * rate
      setPriceCurrency('USD')
      setPrice(usd >= 0.01 ? usd.toFixed(2) : '')
    } else {
      // Convert USD to sats
      const sats = Math.round((num / rate) * 100_000_000)
      setPriceCurrency('SAT')
      setPrice(sats > 0 ? sats.toString() : '')
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || isNaN(priceNum) || priceNum <= 0) return

    let priceSats: number
    let priceUsd: number | undefined

    if (priceCurrency === 'USD' && rate) {
      priceUsd = priceNum
      priceSats = usdToSats(priceNum, rate)
    } else {
      priceSats = Math.round(priceNum)
    }

    if (item) {
      savePOSItem({
        ...item,
        name: name.trim(),
        priceSats,
        priceUsd,
        emoji: emoji || '📦',
        sku: sku.trim() || undefined,
        updatedAt: new Date().toISOString(),
      })
    } else {
      savePOSItem(createPOSItem(name.trim(), priceSats, emoji || '📦', priceUsd, sku.trim() || undefined))
    }
    onSave()
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-surface-800 border border-white/[0.06] rounded-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h3 className="text-lg font-semibold">{item ? 'Edit Item' : 'New Item'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 pb-5 space-y-4">
          {/* Icon picker */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Icon</label>
            <div className="flex flex-wrap gap-1.5">
              {EMOJI_PRESETS.map(e => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEmoji(e)}
                  className={`w-10 h-10 rounded-xl text-lg flex items-center justify-center transition-all ${
                    emoji === e
                      ? 'bg-glow-400/20 border-2 border-glow-400 scale-110'
                      : 'bg-surface-700 border border-white/[0.06] hover:bg-surface-600'
                  }`}
                >
                  {e}
                </button>
              ))}
              {/* Custom input */}
              <input
                type="text"
                value={!EMOJI_PRESETS.includes(emoji) ? emoji : ''}
                onChange={e => setEmoji(e.target.value)}
                placeholder="..."
                maxLength={4}
                className="w-10 h-10 px-1 bg-surface-700 border border-white/[0.06] rounded-xl text-center text-lg focus:outline-none focus:border-glow-400 transition-colors"
              />
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Espresso"
              className="w-full h-11 px-3 bg-surface-700 border border-white/[0.06] rounded-xl text-sm focus:outline-none focus:border-glow-400 transition-colors"
              autoFocus
            />
          </div>

          {/* Price with stepper + currency toggle */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Price</label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => adjustPrice(-priceStep)}
                className="w-11 h-11 rounded-xl bg-surface-700 border border-white/[0.06] flex items-center justify-center text-gray-400 hover:text-white hover:bg-surface-600 transition-colors shrink-0"
              >
                <Minus className="w-4 h-4" />
              </button>
              <input
                type="text"
                inputMode="decimal"
                value={price}
                onChange={e => handlePriceInput(e.target.value)}
                placeholder={priceCurrency === 'USD' ? '5.00' : '500'}
                className="flex-1 h-11 px-3 bg-surface-700 border border-white/[0.06] rounded-xl text-sm text-center focus:outline-none focus:border-glow-400 transition-colors"
              />
              <button
                type="button"
                onClick={() => adjustPrice(priceStep)}
                className="w-11 h-11 rounded-xl bg-surface-700 border border-white/[0.06] flex items-center justify-center text-gray-400 hover:text-white hover:bg-surface-600 transition-colors shrink-0"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={togglePriceCurrency}
                disabled={!rate}
                className="h-11 px-3 rounded-xl bg-surface-700 border border-white/[0.06] text-xs font-semibold text-gray-300 hover:text-white hover:bg-surface-600 disabled:text-gray-600 transition-colors shrink-0"
              >
                {priceCurrency}
              </button>
            </div>
          </div>

          {/* SKU */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">SKU (optional)</label>
            <input
              type="text"
              value={sku}
              onChange={e => setSku(e.target.value)}
              placeholder="e.g. DRK-001"
              className="w-full h-11 px-3 bg-surface-700 border border-white/[0.06] rounded-xl text-sm focus:outline-none focus:border-glow-400 transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={!name.trim() || !price || parseFloat(price) <= 0}
            className="w-full py-3 bg-glow-400 hover:bg-glow-300 active:bg-glow-500 disabled:bg-gray-700 disabled:text-gray-500 text-surface-900 font-bold rounded-xl transition-colors text-sm"
          >
            {item ? 'Save Changes' : 'Add Item'}
          </button>
        </form>
      </div>
    </div>
  )
}
