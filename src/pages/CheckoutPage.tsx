import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { Zap, Copy, Check, Clock, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { getPayment, getMerchant, updatePaymentStatus } from '@/lib/store'
import { formatSats, extractPaymentHash, buildVerifyUrl } from '@/lib/lnurl'
import type { Payment, Merchant } from '@/lib/types'

type PaymentState = 'loading' | 'waiting' | 'verifying' | 'success' | 'expired' | 'error'

export function CheckoutPage() {
  const { paymentId } = useParams<{ merchantId: string; paymentId: string }>()
  const [payment, setPayment] = useState<Payment | null>(null)
  const [merchant, setMerchant] = useState<Merchant | null>(null)
  const [state, setState] = useState<PaymentState>('loading')
  const [copied, setCopied] = useState(false)
  const [timeLeft, setTimeLeft] = useState<number>(0)
  const [error, setError] = useState<string | null>(null)
  const [debugInfo, setDebugInfo] = useState<{ url: string; response: string } | null>(null)

  // Load payment and merchant data
  useEffect(() => {
    if (!paymentId) {
      setError('Payment not found')
      setState('error')
      return
    }

    const p = getPayment(paymentId)
    const m = getMerchant()

    if (!p || !m) {
      setError('Payment or merchant not found')
      setState('error')
      return
    }

    setPayment(p)
    setMerchant(m)

    if (p.status === 'completed') {
      setState('success')
    } else if (p.status === 'expired') {
      setState('expired')
    } else {
      setState('waiting')
    }
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
        updatePaymentStatus(payment.id, 'expired')
        setState('expired')
      }
    }

    updateTimer()
    const interval = setInterval(updateTimer, 1000)
    return () => clearInterval(interval)
  }, [payment, state])

  // Poll for payment verification
  const checkPayment = useCallback(async () => {
    if (!payment || !merchant || state !== 'waiting') return
    
    // Get verify URL - use stored one or construct from invoice
    let verifyUrl = payment.verifyUrl
    if (!verifyUrl && payment.invoice) {
      const paymentHash = extractPaymentHash(payment.invoice)
      if (paymentHash) {
        verifyUrl = buildVerifyUrl(merchant.lightningAddress, paymentHash)
      }
    }
    
    if (!verifyUrl) {
      console.warn('No verify URL available for payment:', payment.id)
      return
    }

    try {
      console.log('Checking payment via LNURL-verify:', verifyUrl)
      setDebugInfo({ url: verifyUrl, response: 'Fetching...' })
      
      const response = await fetch(verifyUrl)
      const responseText = await response.text()
      
      setDebugInfo({ 
        url: verifyUrl, 
        response: `Status: ${response.status} ${response.statusText}\n${responseText}` 
      })
      
      if (!response.ok) {
        console.error('Verify request failed:', response.status, responseText)
        return
      }
      
      const result = JSON.parse(responseText)
      console.log('Verify result:', result)
      
      if (result.settled) {
        const paidAt = new Date().toISOString()
        updatePaymentStatus(payment.id, 'completed', paidAt)
        setState('success')

        // Redirect after short delay
        if (merchant.redirectUrl) {
          setTimeout(() => {
            const url = new URL(merchant.redirectUrl!)
            url.searchParams.set('payment_id', payment.id)
            url.searchParams.set('status', 'paid')
            url.searchParams.set('amount_sats', payment.amountSats.toString())
            window.location.href = url.toString()
          }, 2000)
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      console.error('Verify error:', err)
      setDebugInfo(prev => ({ 
        url: prev?.url || verifyUrl, 
        response: `Error: ${errorMsg}` 
      }))
    }
  }, [payment, merchant, state])

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
        <div className="bg-surface-800 border border-red-500/30 rounded-2xl p-8 text-center max-w-md">
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Error</h1>
          <p className="text-gray-400">{error || 'Something went wrong'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen gradient-bg flex items-center justify-center p-6">
      <div className="bg-surface-800 border border-white/10 rounded-3xl p-8 max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-glow-400 flex items-center justify-center">
              <Zap className="w-5 h-5 text-surface-900" />
            </div>
            <span className="text-lg font-bold">Glow Pay</span>
          </div>
          {merchant?.storeName && (
            <p className="text-gray-400">Pay to {merchant.storeName}</p>
          )}
        </div>

        {/* Amount */}
        <div className="text-center mb-6">
          <p className="text-4xl font-bold text-glow-400 glow-text">
            {formatSats(payment?.amountSats || 0)} sats
          </p>
          {payment?.description && (
            <p className="text-gray-400 mt-2">{payment.description}</p>
          )}
        </div>

        {/* Status-specific content */}
        {state === 'waiting' && payment?.invoice && (
          <>
            {/* QR Code */}
            <div className="qr-container mx-auto w-fit mb-6 glow-bitcoin">
              <QRCodeSVG
                value={payment.invoice.toUpperCase()}
                size={220}
                level="M"
                bgColor="white"
                fgColor="#0a0a0f"
              />
            </div>

            {/* Timer */}
            <div className="flex items-center justify-center gap-2 text-gray-400 mb-4">
              <Clock className="w-4 h-4" />
              <span>Expires in {formatTime(timeLeft)}</span>
            </div>

            {/* Copy button */}
            <button
              onClick={copyInvoice}
              className="w-full flex items-center justify-center gap-2 py-3 bg-surface-700 hover:bg-surface-600 rounded-xl transition-colors mb-4"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-green-400" />
                  <span className="text-green-400">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copy Invoice</span>
                </>
              )}
            </button>

            {/* Waiting indicator */}
            <div className="flex items-center justify-center gap-2 text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Waiting for payment...</span>
            </div>

            {/* Debug info */}
            {debugInfo && (
              <div className="mt-4 p-3 bg-surface-900 rounded-lg border border-white/10 text-xs font-mono">
                <p className="text-gray-400 mb-1">Verify URL:</p>
                <p className="text-glow-400 break-all mb-2">{debugInfo.url}</p>
                <p className="text-gray-400 mb-1">Response:</p>
                <pre className="text-gray-300 whitespace-pre-wrap break-all">{debugInfo.response}</pre>
              </div>
            )}
          </>
        )}

        {state === 'success' && (
          <div className="text-center">
            <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-10 h-10 text-green-500" />
            </div>
            <h2 className="text-2xl font-bold text-green-400 mb-2">Payment Received!</h2>
            <p className="text-gray-400">
              {merchant?.redirectUrl 
                ? 'Redirecting you back...' 
                : 'Thank you for your payment'}
            </p>
          </div>
        )}

        {state === 'expired' && (
          <div className="text-center">
            <div className="w-20 h-20 rounded-full bg-orange-500/20 flex items-center justify-center mx-auto mb-4">
              <Clock className="w-10 h-10 text-orange-500" />
            </div>
            <h2 className="text-2xl font-bold text-orange-400 mb-2">Invoice Expired</h2>
            <p className="text-gray-400">
              This payment request has expired. Please request a new invoice.
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-white/10 text-center">
          <p className="text-xs text-gray-500">
            Powered by Lightning Network • Non-custodial
          </p>
        </div>
      </div>
    </div>
  )
}
