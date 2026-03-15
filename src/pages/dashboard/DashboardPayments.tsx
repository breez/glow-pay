import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Plus, ExternalLink, Copy, Check, CheckCircle, RefreshCw, Loader2, Zap } from 'lucide-react'
import { getMerchant } from '@/lib/store'
import { formatSats } from '@/lib/lnurl'
import { getPaymentFromApi, listPaymentsFromApi, updatePaymentStatusViaApi } from '@/lib/api-client'
import type { Payment } from '@/lib/types'

const statusLabel = (status: string, type?: string) => {
  if (type === 'sweep') return 'Swept'
  if (status === 'completed') return 'Settled'
  if (status === 'expired') return 'Expired'
  return 'Pending'
}

type ToastType = 'success' | 'error' | 'info'

export function DashboardPayments() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [verifyingId, setVerifyingId] = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const merchant = getMerchant()

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }

  const getApiKey = () => merchant?.apiKeys?.find(k => k.active)?.key || merchant?.apiKey || ''

  useEffect(() => {
    const loadPayments = async () => {
      const activeKey = getApiKey()
      if (!activeKey) {
        setIsLoading(false)
        return
      }

      try {
        const result = await listPaymentsFromApi(activeKey)
        if (result.success && result.data) {
          let list: Payment[] = result.data.map(sp => ({
            id: sp.id,
            merchantId: merchant!.id,
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

  const handleCheckPayment = async (payment: Payment) => {
    setVerifyingId(payment.id)
    try {
      const result = await getPaymentFromApi(payment.id)
      if (result.success && result.data) {
        if (result.data.status === 'completed') {
          setPayments(prev => prev.map(p =>
            p.id === payment.id ? { ...p, status: 'completed' as const, paidAt: result.data!.paidAt } : p
          ))
          showToast('Payment verified and marked as settled.', 'success')
        } else if (result.data.status === 'expired') {
          setPayments(prev => prev.map(p =>
            p.id === payment.id ? { ...p, status: 'expired' as const } : p
          ))
          showToast('This payment has expired.', 'info')
        } else {
          showToast('Payment has not been settled yet.', 'info')
        }
      } else {
        showToast(result.error || 'Unable to verify payment.', 'error')
      }
    } catch (err) {
      console.error('Verify error:', err)
      showToast('Unable to verify payment. Please try again.', 'error')
    } finally {
      setVerifyingId(null)
    }
  }

  const handleMarkCompleted = async (paymentId: string) => {
    const activeKey = getApiKey()
    if (!activeKey) {
      showToast('No API key available.', 'error')
      return
    }

    try {
      const result = await updatePaymentStatusViaApi(activeKey, paymentId, 'completed')
      if (result.success) {
        setPayments(prev => prev.map(p =>
          p.id === paymentId ? { ...p, status: 'completed' as const, paidAt: new Date().toISOString() } : p
        ))
        showToast('Payment marked as settled.', 'success')
      } else {
        showToast(result.error || 'Failed to update payment.', 'error')
      }
    } catch (err) {
      console.error('Mark completed error:', err)
      showToast('Failed to update payment. Please try again.', 'error')
    }
    setConfirmingId(null)
  }

  const copyPaymentUrl = async (paymentId: string) => {
    const url = `${window.location.origin}/pay/${merchant?.id}/${paymentId}`
    await navigator.clipboard.writeText(url)
    setCopiedId(paymentId)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const getStatusColor = (status: Payment['status'], type?: string) => {
    if (type === 'sweep') return 'bg-blue-500/20 text-blue-400'
    switch (status) {
      case 'completed': return 'bg-green-500/20 text-green-400'
      case 'expired': return 'bg-red-500/20 text-red-400'
      default: return 'bg-orange-500/20 text-orange-400'
    }
  }

  return (
    <div>
      {/* Toast notification */}
      {toast && (
        <div className={`mb-4 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
          toast.type === 'success' ? 'bg-green-500/15 text-green-400 border border-green-500/20' :
          toast.type === 'error' ? 'bg-red-500/15 text-red-400 border border-red-500/20' :
          'bg-blue-500/15 text-blue-400 border border-blue-500/20'
        }`}>
          {toast.message}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-1">Payments</h1>
          <p className="text-sm text-gray-400">All payment requests and their current status</p>
        </div>
        <Link
          to="/dashboard/payments/new"
          className="hidden md:inline-flex items-center gap-2 px-4 py-2.5 bg-glow-400 hover:bg-glow-300 active:bg-glow-500 text-surface-900 font-semibold rounded-xl transition-all text-sm"
        >
          <Plus className="w-4 h-4" />
          New Payment
        </Link>
      </div>

      {/* Action legend */}
      {payments.some(p => p.status === 'pending') && (
        <div className="mb-5 flex items-center gap-6 text-xs text-gray-500">
          <div className="flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5 text-glow-400" />
            <span>Verify payment</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5 text-green-400" />
            <span>Mark as settled</span>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="bg-surface-800/60 border border-white/[0.06] rounded-2xl p-12 text-center">
          <Loader2 className="w-8 h-8 text-gray-600 animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading payments...</p>
        </div>
      ) : payments.length === 0 ? (
        <div className="bg-surface-800/60 border border-white/[0.06] rounded-2xl p-12 text-center">
          <Zap className="w-12 h-12 text-gray-700 mx-auto mb-3" />
          <p className="text-sm text-gray-500 mb-4">No payment requests yet</p>
          <Link
            to="/dashboard/payments/new"
            className="inline-flex items-center gap-2 px-6 py-3 bg-glow-400 hover:bg-glow-300 text-surface-900 font-semibold rounded-xl transition-colors text-sm"
          >
            <Plus className="w-4 h-4" />
            New Payment
          </Link>
        </div>
      ) : (
        <div className="bg-surface-800/60 border border-white/[0.06] rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Description</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                <th className="px-6 py-3.5 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-sm">
              {payments.map((payment) => (
                <>
                  <tr key={payment.id} className="hover:bg-surface-700/30 transition-colors duration-150">
                    <td className="px-6 py-3.5">
                      <p className="font-medium">{payment.description || 'Payment'}</p>
                      <p className="text-[11px] text-gray-600 font-mono">{payment.id.slice(0, 8)}...</p>
                    </td>
                    <td className="px-6 py-3.5">
                      <p className="font-semibold tabular-nums">
                        {payment.type === 'sweep' && <span className="text-blue-400">-</span>}
                        {formatSats(payment.amountSats)} sats
                      </p>
                    </td>
                    <td className="px-6 py-3.5">
                      <span className={`status-badge ${getStatusColor(payment.status, payment.type)}`}>
                        {statusLabel(payment.status, payment.type)}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-gray-400">
                      {new Date(payment.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </td>
                    <td className="px-6 py-3.5">
                      {payment.type !== 'sweep' && (
                      <div className="flex items-center justify-end gap-1.5">
                        {payment.status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleCheckPayment(payment)}
                              disabled={verifyingId === payment.id}
                              className="p-2 hover:bg-surface-600 rounded-lg transition-colors disabled:opacity-50"
                              title="Verify payment"
                            >
                              {verifyingId === payment.id ? (
                                <Loader2 className="w-4 h-4 text-glow-400 animate-spin" />
                              ) : (
                                <RefreshCw className="w-4 h-4 text-glow-400" />
                              )}
                            </button>
                            <button
                              onClick={() => setConfirmingId(confirmingId === payment.id ? null : payment.id)}
                              className="p-2 hover:bg-surface-600 rounded-lg transition-colors"
                              title="Mark as settled"
                            >
                              <CheckCircle className="w-4 h-4 text-green-400" />
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => copyPaymentUrl(payment.id)}
                          className="p-2 hover:bg-surface-600 rounded-lg transition-colors"
                          title="Copy payment URL"
                        >
                          {copiedId === payment.id ? (
                            <Check className="w-4 h-4 text-green-400" />
                          ) : (
                            <Copy className="w-4 h-4 text-gray-400" />
                          )}
                        </button>
                        <Link
                          to={`/pay/${merchant?.id}/${payment.id}`}
                          target="_blank"
                          className="p-2 hover:bg-surface-600 rounded-lg transition-colors"
                          title="Open payment page"
                        >
                          <ExternalLink className="w-4 h-4 text-gray-400" />
                        </Link>
                      </div>
                      )}
                    </td>
                  </tr>
                  {/* Inline confirmation row */}
                  {confirmingId === payment.id && (
                    <tr key={`confirm-${payment.id}`} className="bg-surface-700/20">
                      <td colSpan={5} className="px-6 py-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-gray-300">
                            Confirm: mark this payment ({formatSats(payment.amountSats)} sats) as settled?
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleMarkCompleted(payment.id)}
                              className="px-3 py-1.5 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg text-xs font-semibold transition-colors"
                            >
                              Yes, Mark Settled
                            </button>
                            <button
                              onClick={() => setConfirmingId(null)}
                              className="px-3 py-1.5 bg-surface-600 hover:bg-surface-500 rounded-lg text-xs font-medium transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
