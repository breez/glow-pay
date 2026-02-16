import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { TrendingUp, ArrowRight, AlertCircle, Wallet, Receipt, Plus } from 'lucide-react'
import { getMerchant, getPayments, updatePaymentStatus } from '@/lib/store'
import { formatSats } from '@/lib/lnurl'
import { useWallet } from '@/lib/wallet/WalletContext'
import type { Merchant, Payment } from '@/lib/types'

const statusLabel = (status: string) => {
  if (status === 'completed') return 'Settled'
  if (status === 'expired') return 'Expired'
  return 'Pending'
}

export function DashboardHome() {
  const [merchant, setMerchant] = useState<Merchant | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const { aggregateBalance } = useWallet()
  const [showWalletBreakdown, setShowWalletBreakdown] = useState(false)

  useEffect(() => {
    setMerchant(getMerchant())
    const allPayments = getPayments()
    for (const p of allPayments) {
      if (p.status === 'pending' && new Date(p.expiresAt) < new Date()) {
        updatePaymentStatus(p.id, 'expired')
        p.status = 'expired'
      }
    }
    setPayments(allPayments)
  }, [])

  const completedPayments = payments.filter(p => p.status === 'completed')
  const recentPayments = payments.filter(p => p.status !== 'pending').slice(0, 5)

  if (!merchant) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight mb-1">Welcome to Glow Pay</h1>
        <p className="text-sm text-gray-400 mb-8">
          Set up your account to start accepting Bitcoin payments.
        </p>

        <div className="bg-surface-800/60 border border-white/[0.06] rounded-2xl p-8">
          <div className="flex items-start gap-4 mb-6">
            <div className="w-12 h-12 rounded-xl bg-glow-400/20 flex items-center justify-center shrink-0">
              <AlertCircle className="w-6 h-6 text-glow-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold mb-2">Complete Setup</h2>
              <p className="text-sm text-gray-400">
                Complete the setup wizard to configure your wallet and start accepting payments.
              </p>
            </div>
          </div>

          <Link
            to="/setup"
            className="inline-flex items-center gap-2 px-6 py-3 bg-glow-400 hover:bg-glow-300 active:bg-glow-500 text-surface-900 font-semibold rounded-xl transition-all"
          >
            Get Started
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-1">Overview</h1>
      {merchant.storeName && (
        <p className="text-sm text-gray-400 mb-6">{merchant.storeName}</p>
      )}
      {!merchant.storeName && <div className="mb-4" />}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-gradient-to-br from-glow-400/[0.06] to-transparent bg-surface-800/60 border border-white/[0.06] rounded-2xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-glow-400/20 flex items-center justify-center">
              <Wallet className="w-4 h-4 text-glow-400" />
            </div>
            <span className="text-sm text-gray-400">Wallet Balance</span>
          </div>
          <p className="text-2xl font-bold tabular-nums">
            {formatSats(aggregateBalance?.totalBalanceSats ?? 0)} <span className="text-base font-normal text-gray-500">sats</span>
          </p>
          {aggregateBalance && aggregateBalance.perWallet.length > 1 && (
            <button
              onClick={() => setShowWalletBreakdown(!showWalletBreakdown)}
              className="text-xs text-gray-500 hover:text-gray-400 mt-2 transition-colors"
            >
              {showWalletBreakdown ? 'Hide breakdown' : 'View breakdown'}
            </button>
          )}
          {showWalletBreakdown && aggregateBalance && (
            <div className="mt-3 space-y-1">
              {aggregateBalance.perWallet.map((w: { accountNumber: number; balanceSats: number; address: string | null }) => (
                <div key={w.accountNumber} className="flex justify-between text-xs text-gray-500">
                  <span>{w.address ? w.address.split('@')[0] : `Account ${w.accountNumber}`}</span>
                  <span className="tabular-nums">{formatSats(w.balanceSats)} sats</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-surface-800/60 border border-white/[0.06] rounded-2xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-green-500/20 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-green-400" />
            </div>
            <span className="text-sm text-gray-400">Settled</span>
          </div>
          <p className="text-2xl font-bold tabular-nums">{completedPayments.length} <span className="text-sm font-normal text-gray-500">payments</span></p>
        </div>

        <div className="bg-surface-800/60 border border-white/[0.06] rounded-2xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/20 flex items-center justify-center">
              <Receipt className="w-4 h-4 text-blue-400" />
            </div>
            <span className="text-sm text-gray-400">Total Requests</span>
          </div>
          <p className="text-2xl font-bold tabular-nums">{payments.length} <span className="text-sm font-normal text-gray-500">payments</span></p>
        </div>
      </div>

      {/* Recent payments */}
      <div className="bg-surface-800/60 border border-white/[0.06] rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-300">Recent Activity</h2>
          <Link
            to="/dashboard/payments"
            className="text-glow-400 hover:text-glow-300 text-xs flex items-center gap-1 transition-colors"
          >
            View all
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {recentPayments.length === 0 ? (
          <div className="p-6 text-center">
            <Receipt className="w-8 h-8 text-gray-700 mx-auto mb-2" />
            <p className="text-sm text-gray-500 mb-3">No activity yet</p>
            <Link
              to="/dashboard/payments/new"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-glow-400 hover:bg-glow-300 text-surface-900 font-semibold rounded-lg text-sm transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Create Payment
            </Link>
          </div>
        ) : (
          <div>
            {recentPayments.map((payment, i) => (
              <div
                key={payment.id}
                className={`px-4 py-2.5 flex items-center justify-between hover:bg-surface-700/30 transition-colors duration-150 ${
                  i > 0 ? 'border-t border-white/[0.03]' : ''
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${
                    payment.status === 'completed' ? 'bg-green-400' :
                    payment.status === 'expired' ? 'bg-red-400' :
                    'bg-orange-400'
                  }`} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{payment.description || 'Payment'}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(payment.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <p className="text-sm font-bold tabular-nums">{formatSats(payment.amountSats)} <span className="text-xs font-normal text-gray-500">sats</span></p>
                  <p className={`text-[10px] font-medium uppercase tracking-wide ${
                    payment.status === 'completed' ? 'text-green-400' :
                    payment.status === 'expired' ? 'text-red-400' :
                    'text-orange-400'
                  }`}>
                    {statusLabel(payment.status)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
