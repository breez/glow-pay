import { decode } from 'light-bolt11-decoder'
import type { LnurlPayResponse, LnurlInvoiceResponse, LnurlVerifyResponse } from './types'

/**
 * Extract payment hash from a bolt11 invoice
 */
export function extractPaymentHash(invoice: string): string | null {
  try {
    const decoded = decode(invoice)
    const paymentHashSection = decoded.sections.find(
      (s: { name: string }) => s.name === 'payment_hash'
    )
    return paymentHashSection?.value || null
  } catch (err) {
    console.error('Failed to decode bolt11 invoice:', err)
    return null
  }
}

/**
 * Build LNURL-verify URL from Lightning address and payment hash
 */
export function buildVerifyUrl(lightningAddress: string, paymentHash: string): string {
  const [username, domain] = lightningAddress.split('@')
  return `https://${domain}/lnurlp/${username}/verify/${paymentHash}`
}

/**
 * Fetch LNURL-pay metadata for a Lightning address
 */
export async function fetchLnurlPayInfo(lightningAddress: string): Promise<LnurlPayResponse> {
  const [username, domain] = lightningAddress.split('@')
  if (!username || !domain) {
    throw new Error('Invalid Lightning address format')
  }

  const url = `https://${domain}/.well-known/lnurlp/${username}`
  const response = await fetch(url)
  
  if (!response.ok) {
    throw new Error(`Failed to fetch LNURL-pay info: ${response.status}`)
  }

  return response.json()
}

/**
 * Request an invoice for a specific amount
 */
export async function requestInvoice(
  callbackUrl: string,
  amountMsats: number,
  comment?: string
): Promise<LnurlInvoiceResponse> {
  const url = new URL(callbackUrl)
  url.searchParams.set('amount', amountMsats.toString())
  if (comment) {
    url.searchParams.set('comment', comment)
  }

  const response = await fetch(url.toString())
  
  if (!response.ok) {
    throw new Error(`Failed to request invoice: ${response.status}`)
  }

  const data = await response.json()
  
  if (data.status === 'ERROR') {
    throw new Error(data.reason || 'Failed to create invoice')
  }

  return data
}

/**
 * Verify if an invoice has been paid using LNURL-verify
 */
export async function verifyPayment(verifyUrl: string): Promise<LnurlVerifyResponse> {
  const response = await fetch(verifyUrl)
  
  if (!response.ok) {
    throw new Error(`Failed to verify payment: ${response.status}`)
  }

  return response.json()
}

/**
 * Convert sats to millisats
 */
export function satsToMsats(sats: number): number {
  return sats * 1000
}

/**
 * Convert millisats to sats
 */
export function msatsToSats(msats: number): number {
  return Math.floor(msats / 1000)
}

/**
 * Format sats for display
 */
export function formatSats(sats: number): string {
  return new Intl.NumberFormat().format(sats)
}

/**
 * Parse a Lightning address or LNURL
 */
export function parseLightningInput(input: string): { type: 'address' | 'lnurl' | 'invoice', value: string } {
  const trimmed = input.trim().toLowerCase()
  
  if (trimmed.includes('@')) {
    return { type: 'address', value: trimmed }
  }
  
  if (trimmed.startsWith('lnurl')) {
    return { type: 'lnurl', value: trimmed }
  }
  
  if (trimmed.startsWith('lnbc') || trimmed.startsWith('lntb')) {
    return { type: 'invoice', value: trimmed }
  }
  
  throw new Error('Invalid Lightning input')
}
