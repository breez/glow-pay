import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Plus, ExternalLink, Copy, Check, CheckCircle, RefreshCw, Loader2 } from 'lucide-react'
import { getPayments, getMerchant, updatePaymentStatus } from '@/lib/store'
import { formatSats } from '@/lib/lnurl'
import { getPaymentFromApi } from '@/lib/api-client'
import type { Payment } from '@/lib/types'

export function DashboardPayments() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [verifyingId, setVerifyingId] = useState<string | null>(null)
  const merchant = getMerchant()

  const refreshPayments = () => {
    setPayments(getPayments())
  }

  useEffect(() => {
    refreshPayments()
  }, [])

  // Check payment status via API (server does LNURL-verify)
  const handleCheckPayment = async (payment: Payment) => {
    setVerifyingId(payment.id)
    try {
      const result = await getPaymentFromApi(payment.id)
      if (result.success && result.data) {
        if (result.data.status === 'completed') {
          updatePaymentStatus(payment.id, 'completed', result.data.paidAt || new Date().toISOString())
          alert('Payment confirmed as settled!')
        } else if (result.data.status === 'expired') {
          updatePaymentStatus(payment.id, 'expired')
          alert('Payment has expired.')
        } else {
          alert('Payment not yet settled.')
        }
      } else {
        alert(result.error || 'Failed to check payment status.')
      }
      refreshPayments()
    } catch (err) {
      console.error('Verify error:', err)
      alert(`Verification failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setVerifyingId(null)
    }
  }

  // Manually mark payment as completed
  const handleMarkCompleted = (payment: Payment) => {
    if (confirm(`Are you sure you want to mark this payment as completed?\n\nAmount: ${formatSats(payment.amountSats)} sats\nID: ${payment.id}\n\nOnly do this if you've verified the payment was received in your wallet.`)) {
      updatePaymentStatus(payment.id, 'completed', new Date().toISOString())
      refreshPayments()
    }
  }

  const copyPaymentUrl = async (paymentId: string) => {
    const url = `${window.location.origin}/pay/${merchant?.id}/${paymentId}`
    await navigator.clipboard.writeText(url)
    setCopiedId(paymentId)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const getStatusColor = (status: Payment['status']) => {
    switch (status) {
      case 'completed': return 'bg-green-500/20 text-green-400'
      case 'expired': return 'bg-red-500/20 text-red-400'
      default: return 'bg-orange-500/20 text-orange-400'
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Payments</h1>
          <p className="text-gray-400">View and manage your payment requests</p>
        </div>
        <Link
          to="/dashboard/payments/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-glow-400 hover:bg-glow-300 text-surface-900 font-semibold rounded-xl transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Payment
        </Link>
      </div>

      {/* Action legend */}
      {payments.some(p => p.status === 'pending') && (
        <div className="mb-6 flex items-center gap-6 text-sm text-gray-400">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-glow-400" />
            <span>Check payment status</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-400" />
            <span>Mark as completed manually</span>
          </div>
        </div>
      )}

      {payments.length === 0 ? (
        <div className="bg-surface-800/50 border border-white/10 rounded-2xl p-12 text-center">
          <p className="text-gray-400 mb-4">No payments yet. Create your first payment link to get started.</p>
          <Link
            to="/dashboard/payments/new"
            className="inline-flex items-center gap-2 px-6 py-3 bg-glow-400 hover:bg-glow-300 text-surface-900 font-semibold rounded-xl transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Payment
          </Link>
        </div>
      ) : (
        <div className="bg-surface-800/50 border border-white/10 rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="px-6 py-4 text-left text-sm font-medium text-gray-400">Description</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-gray-400">Amount</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-gray-400">Status</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-gray-400">Created</th>
                <th className="px-6 py-4 text-right text-sm font-medium text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {payments.map((payment) => (
                <tr key={payment.id} className="hover:bg-surface-700/30">
                  <td className="px-6 py-4">
                    <p className="font-medium">{payment.description || 'Payment'}</p>
                    <p className="text-xs text-gray-500 font-mono">{payment.id}</p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="font-bold">{formatSats(payment.amountSats)} sats</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(payment.status)}`}>
                      {payment.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-400">
                    {new Date(payment.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      {payment.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleCheckPayment(payment)}
                            disabled={verifyingId === payment.id}
                            className="p-2 hover:bg-surface-600 rounded-lg transition-colors disabled:opacity-50"
                            title="Check payment status"
                          >
                            {verifyingId === payment.id ? (
                              <Loader2 className="w-4 h-4 text-glow-400 animate-spin" />
                            ) : (
                              <RefreshCw className="w-4 h-4 text-glow-400" />
                            )}
                          </button>
                          <button
                            onClick={() => handleMarkCompleted(payment)}
                            className="p-2 hover:bg-surface-600 rounded-lg transition-colors"
                            title="Mark as completed"
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
