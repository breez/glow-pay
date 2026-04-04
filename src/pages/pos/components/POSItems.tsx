import { useState } from 'react'
import { Search, Plus, Pencil, Trash2 } from 'lucide-react'
import type { POSItem, CartItem } from '@/lib/pos-store'
import { deletePOSItem } from '@/lib/pos-store'
import { formatSats } from '@/lib/lnurl'
import { satsToUsd, formatUsd } from '@/lib/use-exchange-rate'
import { POSItemForm } from './POSItemForm'

interface POSItemsProps {
  items: POSItem[]
  onItemsChange: () => void
  onAddToCart: (item: POSItem) => void
  cart: CartItem[]
  currency: 'SAT' | 'USD'
  rate: number | null
}

export function POSItems({ items, onItemsChange, onAddToCart, cart, currency, rate }: POSItemsProps) {
  const [search, setSearch] = useState('')
  const [editingItem, setEditingItem] = useState<POSItem | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [contextMenu, setContextMenu] = useState<string | null>(null)

  const query = search.toLowerCase()
  const filtered = items.filter(item =>
    item.name.toLowerCase().includes(query) ||
    (item.sku && item.sku.toLowerCase().includes(query))
  )

  const getCartQty = (itemId: string) => {
    return cart.find(c => c.item.id === itemId)?.quantity || 0
  }

  const handleDelete = (id: string) => {
    deletePOSItem(id)
    onItemsChange()
    setContextMenu(null)
  }

  const handleEdit = (item: POSItem) => {
    setEditingItem(item)
    setShowForm(true)
    setContextMenu(null)
  }

  const formatPrice = (item: POSItem) => {
    if (currency === 'USD' && rate) {
      const usd = satsToUsd(item.priceSats, rate)
      if (usd >= 0.01) return `$${formatUsd(usd)}`
    }
    return `${formatSats(item.priceSats)} sats`
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Search */}
      {items.length > 0 && (
        <div className="relative mx-4 mb-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or SKU"
            className="w-full pl-9 pr-3 py-2.5 bg-surface-800/60 border border-white/[0.06] rounded-xl text-sm focus:outline-none focus:border-glow-400 transition-colors"
          />
        </div>
      )}

      {/* Item list */}
      <div className="flex-1 overflow-y-auto pb-2">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center pt-20 px-4">
            <div className="w-16 h-16 rounded-2xl bg-surface-800/60 border border-white/[0.06] flex items-center justify-center mb-4">
              <Plus className="w-7 h-7 text-gray-600" />
            </div>
            <p className="text-gray-400 text-sm font-medium mb-1">
              {items.length === 0 ? 'No items yet' : 'No matches'}
            </p>
            {items.length === 0 && (
              <p className="text-gray-600 text-xs">Tap + to add your first item</p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {filtered.map(item => {
              const qty = getCartQty(item.id)
              return (
                <div key={item.id} className="relative">
                  <button
                    onClick={() => { onAddToCart(item); setContextMenu(null) }}
                    onContextMenu={e => { e.preventDefault(); setContextMenu(contextMenu === item.id ? null : item.id) }}
                    className="w-full flex items-center gap-3.5 px-4 py-3.5 hover:bg-surface-800/40 active:bg-surface-800/60 transition-colors"
                  >
                    {/* Icon container */}
                    <div className="w-10 h-10 rounded-xl bg-surface-700/80 border border-white/[0.06] flex items-center justify-center shrink-0">
                      <span className="text-lg">{item.emoji}</span>
                    </div>
                    {/* Name + SKU */}
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-sm font-medium text-white truncate">{item.name}</p>
                      {item.sku && (
                        <p className="text-xs text-gray-600 truncate">{item.sku}</p>
                      )}
                    </div>
                    {/* Price */}
                    <span className="text-sm text-gray-400 tabular-nums shrink-0">{formatPrice(item)}</span>
                    {/* Cart quantity badge */}
                    {qty > 0 && (
                      <span className="min-w-5 h-5 px-1 bg-glow-400 text-surface-900 text-xs font-bold rounded-full flex items-center justify-center shrink-0">
                        {qty}
                      </span>
                    )}
                  </button>
                  {/* Context menu */}
                  {contextMenu === item.id && (
                    <div className="absolute top-2 right-4 bg-surface-700 border border-white/[0.1] rounded-xl shadow-xl z-10 overflow-hidden">
                      <button
                        onClick={() => handleEdit(item)}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm text-blue-400 hover:bg-surface-600 w-full"
                      >
                        <Pencil className="w-4 h-4" /> Edit
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm text-red-400 hover:bg-surface-600 w-full"
                      >
                        <Trash2 className="w-4 h-4" /> Delete
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* FAB */}
      <button
        onClick={() => { setEditingItem(null); setShowForm(true) }}
        className="fixed bottom-24 right-4 w-14 h-14 bg-glow-400 hover:bg-glow-300 active:bg-glow-500 text-surface-900 rounded-full shadow-lg shadow-glow-400/20 flex items-center justify-center transition-colors z-10"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* Item form modal */}
      {showForm && (
        <POSItemForm
          item={editingItem}
          currency={currency}
          rate={rate}
          onSave={() => { setShowForm(false); onItemsChange() }}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  )
}
