import { useState, useEffect, useCallback } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Copy, Check, Clock, X, Loader2 } from 'lucide-react'
import { getPaymentFromApi } from '@/lib/api-client'
import { formatSats } from '@/lib/lnurl'
import { satsToUsd, formatUsd } from '@/lib/use-exchange-rate'

interface POSChargingProps {
  paymentId: string
  invoice: string
  amountSats: number
  expiresAt: string
  description: string | null
  currency: 'SAT' | 'USD'
  rate: number | null
  onPaid: () => void
  onCancel: () => void
}

export function POSCharging({ paymentId, invoice, amountSats, expiresAt, description, currency, rate, onPaid, onCancel }: POSChargingProps) {
  const [timeLeft, setTimeLeft] = useState(0)
  const [copied, setCopied] = useState(false)

  // Countdown timer
  useEffect(() => {
    const updateTimer = () => {
      const remaining = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
      setTimeLeft(remaining)
      if (remaining === 0) onCancel()
    }
    updateTimer()
    const interval = setInterval(updateTimer, 1000)
    return () => clearInterval(interval)
  }, [expiresAt, onCancel])

  // Poll for payment
  const checkPayment = useCallback(async () => {
    try {
      const result = await getPaymentFromApi(paymentId)
      if (result.success && result.data?.status === 'completed') {
        onPaid()
      }
    } catch {
      // ignore polling errors
    }
  }, [paymentId, onPaid])

  useEffect(() => {
    const interval = setInterval(checkPayment, 2000)
    return () => clearInterval(interval)
  }, [checkPayment])

  const copyInvoice = async () => {
    await navigator.clipboard.writeText(invoice)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div className="fixed inset-0 gradient-bg z-40 flex flex-col items-center justify-center p-6">
      {/* Cancel */}
      <button
        onClick={onCancel}
        className="absolute top-4 right-4 text-gray-400 hover:text-white p-2"
      >
        <X className="w-6 h-6" />
      </button>

      {/* Amount */}
      <div className="text-center mb-6">
        <p className="text-3xl font-bold tracking-tight tabular-nums text-glow-400">
          {formatSats(amountSats)} sats
        </p>
        {currency === 'USD' && rate && (
          <p className="text-sm text-gray-400 mt-1">${formatUsd(satsToUsd(amountSats, rate))}</p>
        )}
        {description && (
          <p className="text-sm text-gray-500 mt-2">{description}</p>
        )}
      </div>

      {/* QR Code */}
      <div className="qr-container mx-auto w-fit mb-4 glow-bitcoin ring-1 ring-white/10">
        <QRCodeSVG
          value={invoice.toUpperCase()}
          size={240}
          level="M"
          bgColor="white"
          fgColor="#0a0a0f"
        />
      </div>

      {/* Copy button */}
      <button
        onClick={copyInvoice}
        className="flex items-center gap-2 px-4 py-2 bg-surface-800/60 border border-white/[0.06] rounded-xl text-sm text-gray-300 hover:text-white transition-colors mb-4"
      >
        {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
        {copied ? 'Copied' : 'Copy Invoice'}
      </button>

      {/* Timer + status */}
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Loader2 className="w-4 h-4 animate-spin text-glow-400" />
        <span>Waiting for payment</span>
        <span className="text-gray-600">|</span>
        <Clock className="w-3.5 h-3.5" />
        <span className="tabular-nums">{formatTime(timeLeft)}</span>
      </div>
    </div>
  )
}
