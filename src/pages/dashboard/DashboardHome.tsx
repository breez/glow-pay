import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, AlertCircle, Wallet, Zap, Plus, ArrowUpRight, ArrowDownRight, Clock, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { getMerchant } from '@/lib/store'
import { formatSats } from '@/lib/lnurl'
import { getPaymentFromApi, listPaymentsFromApi } from '@/lib/api-client'
import { useWallet } from '@/lib/wallet/WalletContext'
import type { Merchant, Payment } from '@/lib/types'

export function DashboardHome() {
  const [merchant, setMerchant] = useState<Merchant | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { balanceSats, isSyncing } = useWallet()

  useEffect(() => {
    const m = getMerchant()
    setMerchant(m)

    const loadPayments = async () => {
      const activeKey = m?.apiKeys?.find(k => k.active)?.key || m?.apiKey
      if (!activeKey) {
        setIsLoading(false)
        return
      }

      try {
        const result = await listPaymentsFromApi(activeKey)
        if (result.success && result.data) {
          let list: Payment[] = result.data.map(sp => ({
            id: sp.id,
            merchantId: m!.id,
            amountMsats: sp.amountSats * 1000,
            amountSats: sp.amountSats,
            description: sp.description,
            status: sp.status,
            type: sp.type,
            metadata: sp.metadata,
            createdAt: sp.createdAt,
            expiresAt: sp.expiresAt,
            paidAt: sp.paidAt,
            invoice: null,
            verifyUrl: null,
          }))

          // Mark client-side expired
          const now = new Date()
          for (const p of list) {
            if (p.status === 'pending' && new Date(p.expiresAt) < now) {
              p.status = 'expired'
            }
          }

          // Verify pending payments via individual GET (triggers server-side LNURL-verify)
          const pending = list.filter(p => p.status === 'pending')
          for (const p of pending) {
            try {
              const r = await getPaymentFromApi(p.id)
              if (r.success && r.data && r.data.status !== 'pending') {
                p.status = r.data.status
                p.paidAt = r.data.paidAt
              }
            } catch {
              // best-effort
            }
          }

          setPayments(list)
        }
      } catch {
        // best-effort
      }
      setIsLoading(false)
    }

    loadPayments()
  }, [])

  const completed = payments.filter(p => p.status === 'completed' && p.type !== 'sweep')
  const pending = payments.filter(p => p.status === 'pending')
  const recent = payments.slice(0, 5)

  if (!merchant) {
    return (
      <div className="max-w-lg mx-auto pt-8 md:pt-16">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-glow-400/20 flex items-center justify-center mx-auto mb-4">
            <Zap className="w-7 h-7 text-glow-400" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-2">Welcome to Glow Pay</h1>
          <p className="text-sm text-gray-400">
            Set up your account to start accepting bitcoin payments.
          </p>
        </div>

        <div className="bg-surface-800/60 border border-white/[0.06] rounded-2xl p-6">
          <div className="flex items-start gap-3 mb-5">
            <AlertCircle className="w-5 h-5 text-glow-400 shrink-0 mt-0.5" />
            <p className="text-sm text-gray-300">
              Create a new account or restore an existing one to get started. Your keys stay on this device.
            </p>
          </div>
          <Link
            to="/setup"
            className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-glow-400 hover:bg-glow-300 active:bg-glow-500 text-surface-900 font-bold rounded-xl transition-colors text-sm"
          >
            Get Started
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    )
  }

  const totalReceived = completed.reduce((sum, p) => sum + p.amountSats, 0)

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {merchant.storeName || 'Home'}
          </h1>
          {merchant.storeName && (
            <p className="text-sm text-gray-500 mt-0.5">Dashboard overview</p>
          )}
        </div>
        <Link
          to="/dashboard/payments/new"
          className="hidden md:inline-flex items-center gap-2 px-4 py-2.5 bg-glow-400 hover:bg-glow-300 active:bg-glow-500 text-surface-900 font-semibold rounded-xl transition-colors text-sm"
        >
          <Plus className="w-4 h-4" />
          New Payment
        </Link>
      </div>

      {/* Balance card */}
      <div className="bg-gradient-to-br from-glow-400/[0.08] to-glow-400/[0.02] bg-surface-800/60 border border-glow-400/10 rounded-2xl p-5 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Balance</p>
            {isSyncing ? (
              <div className="flex items-center gap-2 h-[36px]">
                <div className="w-4 h-4 border-2 border-glow-400/30 border-t-glow-400 rounded-full animate-spin" />
                <span className="text-sm text-gray-400">Syncing wallet...</span>
              </div>
            ) : (
              <p className="text-3xl font-bold tabular-nums">
                {formatSats(balanceSats)}
                <span className="text-lg font-normal text-gray-500 ml-1.5">sats</span>
              </p>
            )}
          </div>
          <div className="w-11 h-11 rounded-xl bg-glow-400/20 flex items-center justify-center">
            <Wallet className="w-5 h-5 text-glow-400" />
          </div>
        </div>
      </div>

      {/* Mini stats row */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-surface-800/60 border border-white/[0.06] rounded-xl px-4 py-3">
          <p className="text-xs text-gray-500 mb-0.5">Received</p>
          <p className="text-base font-bold tabular-nums">
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin inline" /> : <>{formatSats(totalReceived)} <span className="text-xs font-normal text-gray-500">sats</span></>}
          </p>
        </div>
        <div className="bg-surface-800/60 border border-white/[0.06] rounded-xl px-4 py-3">
          <p className="text-xs text-gray-500 mb-0.5">Settled</p>
          <p className="text-base font-bold tabular-nums">{isLoading ? <Loader2 className="w-4 h-4 animate-spin inline" /> : completed.length}</p>
        </div>
        <div className="bg-surface-800/60 border border-white/[0.06] rounded-xl px-4 py-3">
          <p className="text-xs text-gray-500 mb-0.5">Pending</p>
          <p className="text-base font-bold tabular-nums">{isLoading ? <Loader2 className="w-4 h-4 animate-spin inline" /> : pending.length}</p>
        </div>
      </div>

      {/* Recent activity */}
      <div className="bg-surface-800/60 border border-white/[0.06] rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-300">Recent Activity</h2>
          {payments.length > 0 && (
            <Link
              to="/dashboard/payments"
              className="text-glow-400 hover:text-glow-300 text-xs flex items-center gap-1 transition-colors"
            >
              View all
              <ArrowRight className="w-3 h-3" />
            </Link>
          )}
        </div>

        {isLoading ? (
          <div className="px-4 py-10 text-center">
            <Loader2 className="w-6 h-6 text-gray-600 animate-spin mx-auto mb-2" />
            <p className="text-sm text-gray-500">Loading payments...</p>
          </div>
        ) : recent.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <div className="w-10 h-10 rounded-xl bg-surface-700 flex items-center justify-center mx-auto mb-3">
              <Zap className="w-5 h-5 text-gray-600" />
            </div>
            <p className="text-sm text-gray-500 mb-1">No payments yet</p>
            <p className="text-xs text-gray-600 mb-4">Create your first payment request to get started.</p>
            <Link
              to="/dashboard/payments/new"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-glow-400 hover:bg-glow-300 text-surface-900 font-semibold rounded-lg text-sm transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New Payment
            </Link>
          </div>
        ) : (
          <div>
            {recent.map((payment, i) => (
              <Link
                key={payment.id}
                to="/dashboard/payments"
                className={`px-4 py-3 flex items-center gap-3 hover:bg-surface-700/30 transition-colors duration-150 ${
                  i > 0 ? 'border-t border-white/[0.04]' : ''
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  payment.type === 'sweep' ? 'bg-blue-500/15' :
                  payment.status === 'completed' ? 'bg-green-500/15' :
                  payment.status === 'expired' ? 'bg-red-500/10' :
                  'bg-orange-500/15'
                }`}>
                  {payment.type === 'sweep' ? <ArrowDownRight className="w-4 h-4 text-blue-400" /> :
                   payment.status === 'completed' ? <CheckCircle2 className="w-4 h-4 text-green-400" /> :
                   payment.status === 'expired' ? <XCircle className="w-4 h-4 text-red-400/70" /> :
                   <Clock className="w-4 h-4 text-orange-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{payment.description || 'Payment'}</p>
                  <p className="text-xs text-gray-600">
                    {new Date(payment.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold tabular-nums">
                    {payment.type === 'sweep' ? <span className="text-blue-400">-</span> :
                     payment.status === 'completed' ? <span className="text-green-400">+</span> : null}
                    {formatSats(payment.amountSats)}
                    <span className="text-xs font-normal text-gray-600 ml-1">sats</span>
                  </p>
                </div>
                <ArrowUpRight className="w-3.5 h-3.5 text-gray-600 shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
