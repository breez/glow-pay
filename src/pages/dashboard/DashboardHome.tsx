import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { TrendingUp, Clock, ArrowRight, AlertCircle, Wallet } from 'lucide-react'
import { getMerchant, getPayments } from '@/lib/store'
import { formatSats } from '@/lib/lnurl'
import { useWallet } from '@/lib/wallet/WalletContext'
import type { Merchant, Payment } from '@/lib/types'

export function DashboardHome() {
  const [merchant, setMerchant] = useState<Merchant | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const { aggregateBalance } = useWallet()
  const [showWalletBreakdown, setShowWalletBreakdown] = useState(false)

  useEffect(() => {
    setMerchant(getMerchant())
    setPayments(getPayments())
  }, [])

  const completedPayments = payments.filter(p => p.status === 'completed')
  const recentPayments = payments.slice(0, 5)

  // If no merchant is set up, show onboarding
  if (!merchant) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-3xl font-bold mb-2">Welcome to Glow Pay</h1>
        <p className="text-gray-400 mb-8">
          Set up your merchant account to start accepting Bitcoin payments.
        </p>

        <div className="bg-surface-800/50 border border-white/10 rounded-2xl p-8">
          <div className="flex items-start gap-4 mb-6">
            <div className="w-12 h-12 rounded-xl bg-glow-400/20 flex items-center justify-center shrink-0">
              <AlertCircle className="w-6 h-6 text-glow-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold mb-2">Complete Setup</h2>
              <p className="text-gray-400">
                You need to configure your Lightning address before you can accept payments.
                Go to Settings to get started.
              </p>
            </div>
          </div>

          <Link
            to="/dashboard/settings"
            className="inline-flex items-center gap-2 px-6 py-3 bg-glow-400 hover:bg-glow-300 text-surface-900 font-semibold rounded-xl transition-colors"
          >
            Go to Settings
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
      <p className="text-gray-400 mb-8">
        Welcome back, {merchant.storeName || merchant.lightningAddress}
      </p>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-surface-800/50 border border-white/10 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-glow-400/20 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-glow-400" />
            </div>
            <span className="text-gray-400">Wallet Balance</span>
          </div>
          <p className="text-3xl font-bold">
            {formatSats(aggregateBalance?.totalBalanceSats ?? 0)} <span className="text-lg text-gray-400">sats</span>
          </p>
          {aggregateBalance && aggregateBalance.perWallet.length > 1 && (
            <button
              onClick={() => setShowWalletBreakdown(!showWalletBreakdown)}
              className="text-xs text-gray-500 hover:text-gray-400 mt-2"
            >
              {showWalletBreakdown ? 'Hide' : 'Show'} across {aggregateBalance.perWallet.length} wallets
            </button>
          )}
          {showWalletBreakdown && aggregateBalance && (
            <div className="mt-3 space-y-1">
              {aggregateBalance.perWallet.map((w: { accountNumber: number; balanceSats: number; address: string | null }) => (
                <div key={w.accountNumber} className="flex justify-between text-xs text-gray-500">
                  <span>{w.address ? w.address.split('@')[0] : `Account ${w.accountNumber}`}</span>
                  <span>{formatSats(w.balanceSats)} sats</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-surface-800/50 border border-white/10 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-green-400" />
            </div>
            <span className="text-gray-400">Completed</span>
          </div>
          <p className="text-3xl font-bold">{completedPayments.length} <span className="text-lg text-gray-400">payments</span></p>
        </div>

        <div className="bg-surface-800/50 border border-white/10 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center">
              <Clock className="w-5 h-5 text-orange-400" />
            </div>
            <span className="text-gray-400">Pending</span>
          </div>
          <p className="text-3xl font-bold">{payments.filter(p => p.status === 'pending').length} <span className="text-lg text-gray-400">payments</span></p>
        </div>
      </div>

      {/* Recent payments */}
      <div className="bg-surface-800/50 border border-white/10 rounded-2xl">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-xl font-bold">Recent Payments</h2>
          <Link
            to="/dashboard/payments"
            className="text-glow-400 hover:text-glow-300 text-sm flex items-center gap-1"
          >
            View all
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {recentPayments.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <p>No payments yet. Create your first payment link!</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {recentPayments.map((payment) => (
              <div key={payment.id} className="px-6 py-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">{payment.description || 'Payment'}</p>
                  <p className="text-sm text-gray-500">
                    {new Date(payment.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold">{formatSats(payment.amountSats)} sats</p>
                  <p className={`text-sm ${
                    payment.status === 'completed' ? 'text-green-400' :
                    payment.status === 'expired' ? 'text-red-400' :
                    'text-orange-400'
                  }`}>
                    {payment.status}
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
