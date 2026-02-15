import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { Zap, Copy, Check, Clock, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { getPayment, getMerchant, updatePaymentStatus } from '@/lib/store'
import { formatSats } from '@/lib/lnurl'
import { getPaymentFromApi } from '@/lib/api-client'

type PaymentState = 'loading' | 'waiting' | 'verifying' | 'success' | 'expired' | 'error'

interface PaymentData {
  id: string
  amountSats: number
  description: string | null
  invoice: string | null
  status: 'pending' | 'completed' | 'expired'
  expiresAt: string
  paidAt: string | null
  verifyUrl: string | null
}

interface MerchantData {
  storeName: string
  redirectUrl: string | null
}

export function CheckoutPage() {
  const { paymentId } = useParams<{ merchantId: string; paymentId: string }>()
  const [payment, setPayment] = useState<PaymentData | null>(null)
  const [merchant, setMerchant] = useState<MerchantData | null>(null)
  const [state, setState] = useState<PaymentState>('loading')
  const [copied, setCopied] = useState(false)
  const [timeLeft, setTimeLeft] = useState<number>(0)
  const [error, setError] = useState<string | null>(null)
  const isApiPaymentRef = useRef(false)

  // Load payment data: try API first, then localStorage fallback
  useEffect(() => {
    if (!paymentId) {
      setError('Payment not found')
      setState('error')
      return
    }

    let cancelled = false

    const loadPayment = async () => {
      // Try API first
      try {
        const result = await getPaymentFromApi(paymentId)
        if (!cancelled && result.success && result.data) {
          isApiPaymentRef.current = true
          setPayment({
            id: result.data.id,
            amountSats: result.data.amountSats,
            description: result.data.description,
            invoice: result.data.invoice,
            status: result.data.status,
            expiresAt: result.data.expiresAt,
            paidAt: result.data.paidAt,
            verifyUrl: result.data.verifyUrl,
          })
          setMerchant(result.data.merchant)

          if (result.data.status === 'completed') {
            setState('success')
          } else if (result.data.status === 'expired') {
            setState('expired')
          } else {
            setState('waiting')
          }
          return
        }
      } catch {
        // API unavailable, try localStorage
      }

      if (cancelled) return

      // Fallback: localStorage
      const p = getPayment(paymentId)
      const m = getMerchant()

      if (!p || !m) {
        setError('Payment not found')
        setState('error')
        return
      }

      isApiPaymentRef.current = false
      setPayment({
        id: p.id,
        amountSats: p.amountSats,
        description: p.description,
        invoice: p.invoice,
        status: p.status,
        expiresAt: p.expiresAt,
        paidAt: p.paidAt,
        verifyUrl: p.verifyUrl,
      })
      setMerchant({ storeName: m.storeName, redirectUrl: m.redirectUrl })

      if (p.status === 'completed') {
        setState('success')
      } else if (p.status === 'expired') {
        setState('expired')
      } else {
        setState('waiting')
      }
    }

    loadPayment()
    return () => { cancelled = true }
  }, [paymentId])

  // Countdown timer
  useEffect(() => {
    if (!payment || state !== 'waiting') return

    const updateTimer = () => {
      const expiresAt = new Date(payment.expiresAt).getTime()
      const now = Date.now()
      const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000))
      setTimeLeft(remaining)

      if (remaining === 0) {
        setState('expired')
      }
    }

    updateTimer()
    const interval = setInterval(updateTimer, 1000)
    return () => clearInterval(interval)
  }, [payment, state])

  // Poll for payment verification
  const checkPayment = useCallback(async () => {
    if (!payment || state !== 'waiting' || !paymentId) return

    try {
      if (isApiPaymentRef.current) {
        // Check via API (server does LNURL-verify)
        const result = await getPaymentFromApi(paymentId)
        if (result.success && result.data) {
          if (result.data.status === 'completed') {
            setPayment(prev => prev ? { ...prev, status: 'completed', paidAt: result.data!.paidAt } : null)
            setState('success')

            if (merchant?.redirectUrl) {
              setTimeout(() => {
                const url = new URL(merchant.redirectUrl!)
                url.searchParams.set('payment_id', payment.id)
                url.searchParams.set('status', 'paid')
                url.searchParams.set('amount_sats', payment.amountSats.toString())
                window.location.href = url.toString()
              }, 2000)
            }
          } else if (result.data.status === 'expired') {
            setState('expired')
          }
        }
      } else {
        // Fallback: direct LNURL-verify for localStorage payments
        if (!payment.verifyUrl) return
        const response = await fetch(payment.verifyUrl)
        if (!response.ok) return
        const result = await response.json()
        if (result.settled) {
          const paidAt = new Date().toISOString()
          updatePaymentStatus(payment.id, 'completed', paidAt)
          setPayment(prev => prev ? { ...prev, status: 'completed', paidAt } : null)
          setState('success')

          if (merchant?.redirectUrl) {
            setTimeout(() => {
              const url = new URL(merchant.redirectUrl!)
              url.searchParams.set('payment_id', payment.id)
              url.searchParams.set('status', 'paid')
              url.searchParams.set('amount_sats', payment.amountSats.toString())
              window.location.href = url.toString()
            }, 2000)
          }
        }
      }
    } catch (err) {
      console.warn('Payment check failed:', err)
    }
  }, [payment, merchant, state, paymentId])

  // Poll every 2 seconds while waiting
  useEffect(() => {
    if (state !== 'waiting') return

    const interval = setInterval(checkPayment, 2000)
    return () => clearInterval(interval)
  }, [state, checkPayment])

  // Copy invoice to clipboard
  const copyInvoice = async () => {
    if (!payment?.invoice) return
    await navigator.clipboard.writeText(payment.invoice)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Format time remaining
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (state === 'loading') {
    return (
      <div className="min-h-screen gradient-bg flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-glow-400" />
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="min-h-screen gradient-bg flex items-center justify-center p-6">
        <div className="bg-surface-800 border border-red-500/30 rounded-2xl p-8 text-center max-w-md shadow-2xl shadow-black/40">
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Payment Not Found</h1>
          <p className="text-gray-400">
            We could not locate this payment. The link may be invalid or the payment may have expired.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen gradient-bg flex items-center justify-center p-6">
      <div className="bg-surface-800 border border-white/[0.06] rounded-3xl p-8 max-w-md w-full shadow-2xl shadow-black/40">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-10 h-10 rounded-lg bg-glow-400 flex items-center justify-center shadow-lg shadow-glow-400/20">
              <Zap className="w-6 h-6 text-surface-900" />
            </div>
            <span className="text-lg font-bold">Glow Pay</span>
          </div>
          {merchant?.storeName && (
            <p className="text-gray-400">{merchant.storeName}</p>
          )}
        </div>

        {/* Amount */}
        <div className="text-center mb-6">
          <p className="text-4xl font-bold tracking-tight text-glow-400 glow-text tabular-nums">
            {formatSats(payment?.amountSats || 0)} sats
          </p>
          {payment?.description && (
            <p className="text-sm text-gray-400 mt-2">{payment.description}</p>
          )}
        </div>

        {/* Status-specific content */}
        {state === 'waiting' && payment?.invoice && (
          <>
            {/* QR Code */}
            <div className="qr-container mx-auto w-fit mb-6 glow-bitcoin ring-1 ring-white/10">
              <QRCodeSVG
                value={payment.invoice.toUpperCase()}
                size={240}
                level="M"
                bgColor="white"
                fgColor="#0a0a0f"
              />
            </div>

            {/* Timer */}
            <div className={`flex items-center justify-center gap-2 mb-4 ${timeLeft < 60 ? 'text-orange-400' : 'text-gray-400'}`}>
              <Clock className="w-4 h-4" />
              <span>This invoice expires in {formatTime(timeLeft)}</span>
            </div>

            {/* Copy button */}
            <button
              onClick={copyInvoice}
              className="w-full flex items-center justify-center gap-2 py-3 bg-surface-700 hover:bg-surface-600 border border-white/[0.06] rounded-xl transition-colors mb-4"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-green-400" />
                  <span className="text-green-400">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copy Payment Code</span>
                </>
              )}
            </button>

            {/* Waiting indicator */}
            <div className="flex items-center justify-center gap-2 text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Listening for payment...</span>
            </div>
          </>
        )}

        {state === 'success' && (
          <div className="text-center">
            <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4 animate-bounce-in">
              <CheckCircle2 className="w-10 h-10 text-green-500" />
            </div>
            <h2 className="text-2xl font-bold text-green-400 mb-2">Payment Confirmed</h2>
            <p className="text-gray-400">
              {merchant?.redirectUrl
                ? 'Returning you to the merchant...'
                : 'Your payment has been received successfully.'}
            </p>
          </div>
        )}

        {state === 'expired' && (
          <div className="text-center">
            <div className="w-20 h-20 rounded-full bg-orange-500/20 flex items-center justify-center mx-auto mb-4">
              <Clock className="w-10 h-10 text-orange-500" />
            </div>
            <h2 className="text-2xl font-bold text-orange-400 mb-2">This Payment Has Expired</h2>
            <p className="text-gray-400">
              The time limit for this payment has passed. Please contact the merchant for a new payment link.
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-white/[0.06] text-center">
          <p className="text-xs text-gray-500">
            Secured by the Lightning Network
          </p>
        </div>
      </div>
    </div>
  )
}
