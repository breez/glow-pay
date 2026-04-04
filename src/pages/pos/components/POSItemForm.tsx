import { useState } from 'react'
import { X } from 'lucide-react'
import type { POSItem } from '@/lib/pos-store'
import { createPOSItem, savePOSItem } from '@/lib/pos-store'
import { usdToSats } from '@/lib/use-exchange-rate'

interface POSItemFormProps {
  item: POSItem | null
  currency: 'SAT' | 'USD'
  rate: number | null
  onSave: () => void
  onClose: () => void
}

export function POSItemForm({ item, currency, rate, onSave, onClose }: POSItemFormProps) {
  const [name, setName] = useState(item?.name || '')
  const [price, setPrice] = useState(() => {
    if (!item) return ''
    if (currency === 'USD' && item.priceUsd) return item.priceUsd.toString()
    return item.priceSats.toString()
  })
  const [emoji, setEmoji] = useState(item?.emoji || '')
  const [sku, setSku] = useState(item?.sku || '')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const priceNum = parseFloat(price)
    if (!name.trim() || isNaN(priceNum) || priceNum <= 0) return

    let priceSats: number
    let priceUsd: number | undefined

    if (currency === 'USD' && rate) {
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
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-surface-800 border border-white/[0.06] rounded-t-2xl sm:rounded-2xl w-full max-w-sm"
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
          {/* Emoji + Name row */}
          <div className="flex gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Icon</label>
              <input
                type="text"
                value={emoji}
                onChange={e => setEmoji(e.target.value)}
                placeholder="📦"
                maxLength={4}
                className="w-14 h-11 px-2 bg-surface-700 border border-white/[0.06] rounded-xl text-center text-xl focus:outline-none focus:border-glow-400 transition-colors"
              />
            </div>
            <div className="flex-1">
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
          </div>

          {/* Price + SKU row */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                Price ({currency === 'USD' ? 'USD' : 'sats'})
              </label>
              <input
                type="number"
                value={price}
                onChange={e => setPrice(e.target.value)}
                placeholder={currency === 'USD' ? '5.00' : '500'}
                step={currency === 'USD' ? '0.01' : '1'}
                min="0"
                className="w-full h-11 px-3 bg-surface-700 border border-white/[0.06] rounded-xl text-sm focus:outline-none focus:border-glow-400 transition-colors"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 mb-1.5">SKU</label>
              <input
                type="text"
                value={sku}
                onChange={e => setSku(e.target.value)}
                placeholder="Optional"
                className="w-full h-11 px-3 bg-surface-700 border border-white/[0.06] rounded-xl text-sm focus:outline-none focus:border-glow-400 transition-colors"
              />
            </div>
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
