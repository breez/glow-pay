import { X, Plus, Minus, Trash2 } from 'lucide-react'
import type { CartItem } from '@/lib/pos-store'
import { formatSats } from '@/lib/lnurl'
import { satsToUsd, formatUsd } from '@/lib/use-exchange-rate'

interface POSCartProps {
  items: CartItem[]
  currency: 'SAT' | 'USD'
  rate: number | null
  onUpdateQuantity: (itemId: string, delta: number) => void
  onRemove: (itemId: string) => void
  onClear: () => void
  onClose: () => void
}

export function POSCart({ items, currency, rate, onUpdateQuantity, onRemove, onClear, onClose }: POSCartProps) {
  const itemToSats = (item: CartItem['item']): number => {
    if (item.priceUsd && rate) return Math.round((item.priceUsd / rate) * 100_000_000)
    return item.priceSats
  }
  const total = items.reduce((sum, ci) => sum + itemToSats(ci.item) * ci.quantity, 0)

  const formatItemPrice = (item: CartItem['item']) => {
    if (item.priceUsd) return `$${formatUsd(item.priceUsd)}`
    return `${formatSats(item.priceSats)} sats`
  }

  const formatTotal = (sats: number) => {
    if (currency === 'USD' && rate) {
      return `$${formatUsd(satsToUsd(sats, rate))}`
    }
    return `${formatSats(sats)} sats`
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-surface-800 border border-white/[0.06] rounded-2xl w-full max-w-sm max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/[0.06]">
          <h3 className="text-lg font-semibold">Cart ({items.reduce((s, c) => s + c.quantity, 0)})</h3>
          <div className="flex items-center gap-3">
            {items.length > 0 && (
              <button onClick={onClear} className="text-xs text-red-400 hover:text-red-300">
                Clear all
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {items.length === 0 ? (
            <p className="text-center text-gray-500 text-sm py-8">Cart is empty</p>
          ) : (
            items.map(ci => (
              <div key={ci.item.id} className="flex items-center gap-3 bg-surface-700/40 rounded-xl p-3">
                <span className="text-xl">{ci.item.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{ci.item.name}</p>
                  <p className="text-xs text-gray-400">{formatItemPrice(ci.item)}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => onUpdateQuantity(ci.item.id, -1)}
                    className="w-7 h-7 rounded-lg bg-surface-700 border border-white/[0.06] flex items-center justify-center text-gray-400 hover:text-white transition-colors"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-6 text-center text-sm font-semibold tabular-nums">{ci.quantity}</span>
                  <button
                    onClick={() => onUpdateQuantity(ci.item.id, 1)}
                    className="w-7 h-7 rounded-lg bg-surface-700 border border-white/[0.06] flex items-center justify-center text-gray-400 hover:text-white transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
                <button
                  onClick={() => onRemove(ci.item.id)}
                  className="text-gray-500 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Total */}
        {items.length > 0 && (
          <div className="px-4 pb-4 pt-3 border-t border-white/[0.06]">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-400">Total</span>
              <span className="text-lg font-bold text-white">{formatTotal(total)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
