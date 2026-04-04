import { CheckCircle2, Printer, RotateCcw } from 'lucide-react'
import type { CartItem } from '@/lib/pos-store'
import { formatSats } from '@/lib/lnurl'
import { satsToUsd, formatUsd } from '@/lib/use-exchange-rate'

interface POSReceiptProps {
  amountSats: number
  paymentId: string
  items: CartItem[]
  storeName: string
  currency: 'SAT' | 'USD'
  rate: number | null
  onNewSale: () => void
}

export function POSReceipt({ amountSats, paymentId, items, storeName, rate, onNewSale }: POSReceiptProps) {
  const paidAt = new Date()

  return (
    <div className="fixed inset-0 gradient-bg z-40 flex flex-col items-center justify-center p-6">
      {/* Success icon */}
      <div className="animate-bounce-in mb-4">
        <CheckCircle2 className="w-16 h-16 text-green-400" />
      </div>

      <p className="text-2xl font-bold text-green-400 mb-1">Payment Received</p>
      <p className="text-3xl font-bold tracking-tight tabular-nums text-white mb-6">
        {formatSats(amountSats)} sats
      </p>

      {/* Printable receipt (hidden on screen, visible in print) */}
      <div className="pos-receipt-print">
        <div className="text-center mb-4">
          <h2 className="text-base font-bold">{storeName || 'Glow Pay POS'}</h2>
          <p className="text-xs">{paidAt.toLocaleDateString()} {paidAt.toLocaleTimeString()}</p>
        </div>

        {items.length > 0 && (
          <div className="mb-3">
            <div className="border-b border-gray-300 mb-2 pb-1">
              {items.map(ci => (
                <div key={ci.item.id} className="flex justify-between text-xs py-0.5">
                  <span>{ci.item.emoji} {ci.item.name} x{ci.quantity}</span>
                  <span>{formatSats(ci.item.priceSats * ci.quantity)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-between font-bold text-sm mb-1">
          <span>Total</span>
          <span>{formatSats(amountSats)} sats</span>
        </div>
        {rate && (
          <div className="flex justify-between text-xs text-gray-600 mb-3">
            <span></span>
            <span>${formatUsd(satsToUsd(amountSats, rate))} USD</span>
          </div>
        )}

        <div className="text-center text-xs text-gray-500 mt-4 pt-3 border-t border-gray-300">
          <p>Paid via Lightning</p>
          <p className="font-mono text-[10px] mt-1">{paymentId}</p>
          <p className="mt-2">Powered by Glow Pay</p>
        </div>
      </div>

      {/* Screen buttons */}
      <div className="flex gap-3 no-print">
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-5 py-3 bg-surface-800/60 border border-white/[0.06] rounded-xl text-sm text-gray-300 hover:text-white transition-colors"
        >
          <Printer className="w-4 h-4" />
          Print Receipt
        </button>
        <button
          onClick={onNewSale}
          className="flex items-center gap-2 px-5 py-3 bg-glow-400 hover:bg-glow-300 active:bg-glow-500 text-surface-900 font-bold rounded-xl transition-colors text-sm"
        >
          <RotateCcw className="w-4 h-4" />
          New Sale
        </button>
      </div>
    </div>
  )
}
