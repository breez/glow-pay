import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Zap, ArrowLeft, ExternalLink, Copy, Check } from 'lucide-react'
import { getMerchant, savePayment } from '@/lib/store'
import { formatSats } from '@/lib/lnurl'
import { createPaymentViaApi, syncMerchantToServer } from '@/lib/api-client'
import type { Payment } from '@/lib/types'

export function DashboardCreatePayment() {
  const navigate = useNavigate()
  const [amountSats, setAmountSats] = useState('')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdPayment, setCreatedPayment] = useState<Payment | null>(null)
  const [copied, setCopied] = useState(false)
  const [invoiceResponseDebug, setInvoiceResponseDebug] = useState<string | null>(null)

  const merchant = getMerchant()

  const handleCreate = async () => {
    if (!merchant) {
      setError('Please configure your Lightning address in Settings first.')
      return
    }

    const sats = parseInt(amountSats)
    if (!sats || sats < 1) {
      setError('Please enter a valid amount (minimum 1 sat)')
      return
    }

    setCreating(true)
    setError(null)

    try {
      const activeKey = merchant.apiKeys?.find(k => k.active)?.key || merchant.apiKey

      let result = await createPaymentViaApi(
        activeKey,
        sats,
        description || undefined,
      )

      // If 401, auto-sync merchant to server and retry
      if (!result.success && result.error?.includes('Invalid API key')) {
        await syncMerchantToServer({
          merchantId: merchant.id,
          apiKey: activeKey,
          apiKeys: merchant.apiKeys,
          storeName: merchant.storeName,
          lightningAddresses: merchant.lightningAddresses,
          redirectUrl: merchant.redirectUrl,
          rotationEnabled: merchant.rotationEnabled,
        })
        result = await createPaymentViaApi(
          activeKey,
          sats,
          description || undefined,
        )
      }

      if (!result.success || !result.data) {
        setError(result.error || 'Failed to create payment')
        return
      }

      setInvoiceResponseDebug(JSON.stringify(result.data, null, 2))

      // Save locally for payment history
      const payment: Payment = {
        id: result.data.paymentId,
        merchantId: merchant.id,
        amountMsats: sats * 1000,
        amountSats: sats,
        description: description || null,
        invoice: result.data.invoice,
        verifyUrl: result.data.verifyUrl,
        status: 'pending',
        metadata: null,
        createdAt: new Date().toISOString(),
        paidAt: null,
        expiresAt: result.data.expiresAt,
      }

      savePayment(payment)
      setCreatedPayment(payment)
    } catch (err) {
      console.error('Create payment error:', err)
      setError(err instanceof Error ? err.message : 'Failed to create payment')
    } finally {
      setCreating(false)
    }
  }

  const getPaymentUrl = () => {
    if (!createdPayment || !merchant) return ''
    return `${window.location.origin}/pay/${merchant.id}/${createdPayment.id}`
  }

  const copyUrl = async () => {
    await navigator.clipboard.writeText(getPaymentUrl())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // If no merchant configured
  if (!merchant) {
    return (
      <div className="max-w-lg">
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="bg-surface-800/50 border border-orange-500/30 rounded-2xl p-8 text-center">
          <h2 className="text-xl font-bold mb-2">Setup Required</h2>
          <p className="text-gray-400 mb-4">
            Please configure your Lightning address in Settings before creating payments.
          </p>
          <button
            onClick={() => navigate('/dashboard/settings')}
            className="px-6 py-3 bg-glow-400 hover:bg-glow-300 text-surface-900 font-semibold rounded-xl transition-colors"
          >
            Go to Settings
          </button>
        </div>
      </div>
    )
  }

  // Payment created successfully
  if (createdPayment) {
    return (
      <div className="max-w-lg">
        <button
          onClick={() => navigate('/dashboard/payments')}
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Payments
        </button>

        <div className="bg-surface-800/50 border border-green-500/30 rounded-2xl p-8">
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
              <Zap className="w-8 h-8 text-green-400" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Payment Created!</h2>
            <p className="text-gray-400">
              Share this link with your customer
            </p>
          </div>

          <div className="bg-surface-900 rounded-xl p-4 mb-4">
            <p className="text-sm text-gray-400 mb-1">Amount</p>
            <p className="text-2xl font-bold text-glow-400">{formatSats(createdPayment.amountSats)} sats</p>
          </div>

          <div className="bg-surface-900 rounded-xl p-4 mb-6">
            <p className="text-sm text-gray-400 mb-2">Payment URL</p>
            <p className="text-sm font-mono break-all text-gray-300">{getPaymentUrl()}</p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={copyUrl}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-glow-400 hover:bg-glow-300 text-surface-900 font-semibold rounded-xl transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Copy Link
                </>
              )}
            </button>
            <a
              href={getPaymentUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-6 py-3 bg-surface-700 hover:bg-surface-600 rounded-xl transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Open
            </a>
          </div>

          <button
            onClick={() => {
              setCreatedPayment(null)
              setAmountSats('')
              setDescription('')
              setInvoiceResponseDebug(null)
            }}
            className="w-full mt-4 py-3 text-gray-400 hover:text-white transition-colors"
          >
            Create Another Payment
          </button>

          {/* Debug: Invoice Response */}
          {invoiceResponseDebug && (
            <div className="mt-6 p-4 bg-surface-900 rounded-xl border border-white/10">
              <p className="text-sm text-gray-400 mb-2">API Response:</p>
              <pre className="text-xs font-mono text-gray-300 whitespace-pre-wrap break-all overflow-auto max-h-64">
                {invoiceResponseDebug}
              </pre>
              {createdPayment?.verifyUrl && (
                <div className="mt-3 pt-3 border-t border-white/10">
                  <p className="text-sm text-gray-400 mb-1">Verify URL being used:</p>
                  <p className="text-xs font-mono text-glow-400 break-all">{createdPayment.verifyUrl}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Create payment form
  return (
    <div className="max-w-lg">
      <button
        onClick={() => navigate('/dashboard/payments')}
        className="flex items-center gap-2 text-gray-400 hover:text-white mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      <h1 className="text-3xl font-bold mb-2">New Payment</h1>
      <p className="text-gray-400 mb-8">Create a payment request for your customer</p>

      <div className="bg-surface-800/50 border border-white/10 rounded-2xl p-6 space-y-6">
        {/* Amount */}
        <div>
          <label className="block text-sm text-gray-400 mb-2">Amount (sats) *</label>
          <div className="relative">
            <input
              type="text"
              inputMode="numeric"
              value={amountSats}
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9]/g, '')
                setAmountSats(val)
              }}
              placeholder="1000"
              className="w-full px-4 py-3 bg-surface-700 border border-white/10 rounded-xl focus:outline-none focus:border-glow-400 transition-colors text-2xl font-bold"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500">sats</span>
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm text-gray-400 mb-2">Description (optional)</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Payment for..."
            className="w-full px-4 py-3 bg-surface-700 border border-white/10 rounded-xl focus:outline-none focus:border-glow-400 transition-colors"
          />
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Create button */}
        <button
          onClick={handleCreate}
          disabled={creating || !amountSats}
          className="w-full flex items-center justify-center gap-2 py-4 bg-glow-400 hover:bg-glow-300 disabled:bg-gray-600 disabled:cursor-not-allowed text-surface-900 font-bold rounded-xl transition-colors"
        >
          {creating ? (
            'Creating...'
          ) : (
            <>
              <Zap className="w-5 h-5" />
              Create Payment
            </>
          )}
        </button>
      </div>
    </div>
  )
}
