import type { VercelRequest, VercelResponse } from '@vercel/node'
import QRCode from 'qrcode'
import { randomUUID } from 'crypto'
import {
  getMerchantByApiKey,
  getPaymentFromKv,
  savePaymentToKv,
  getRedis,
  type ServerPayment,
} from '../_lib/redis.js'
import { getInstallation, getOrder, isValidShopDomain } from '../_lib/shopify.js'
import { fetchLnurlPayInfo, requestInvoice, satsToMsats } from '../../src/lib/lnurl.js'

const PAYMENT_EXPIRY_SECS = 600
const orderIndexKey = (shop: string, orderId: string) => `shopify:order:${shop}:${orderId}`

/**
 * Returns the entire payment UI as an SVG image. Used by the Shopify
 * Checkout UI extension which can render <Image source={…}> without
 * any network_access capability — but cannot use fetch().
 *
 * The extension polls by bumping a cache-buster query param every few
 * seconds; when the underlying payment status flips, the next SVG
 * tick reflects it ("Waiting…" → "Paid ✓").
 *
 *   /api/shopify/invoice.svg?shop=xxx.myshopify.com&order=12345
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'image/svg+xml')
  res.setHeader('Cache-Control', 'no-store, max-age=0')
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')

  const shop = typeof req.query.shop === 'string' ? req.query.shop : undefined
  const orderIdRaw = typeof req.query.order === 'string' ? req.query.order : undefined

  if (!isValidShopDomain(shop)) {
    return res.status(200).send(errorSvg('Invalid shop domain.'))
  }
  if (!orderIdRaw || !/^\d+$/.test(orderIdRaw)) {
    return res.status(200).send(errorSvg('Invalid order id.'))
  }

  try {
    const payment = await getOrCreatePayment(shop, orderIdRaw)
    if (!payment) {
      return res.status(200).send(paidSvg())
    }
    if (payment.status === 'completed') return res.status(200).send(paidSvg())
    if (payment.status === 'expired') return res.status(200).send(expiredSvg())
    return res.status(200).send(await pendingSvg(payment.amountSats, payment.invoice ?? ''))
  } catch (err) {
    console.error('invoice.svg error:', err)
    return res.status(200).send(errorSvg(err instanceof Error ? err.message : 'Failed to load payment'))
  }
}

async function getOrCreatePayment(shop: string, orderIdRaw: string): Promise<ServerPayment | null> {
  const install = await getInstallation(shop)
  if (!install) throw new Error('Shopify store not connected')
  if (!install.apiKey || !install.merchantId) throw new Error('Store not linked to a Glow Pay account')

  const merchant = await getMerchantByApiKey(install.apiKey)
  if (!merchant) throw new Error('Linked Glow Pay account is invalid')
  if (!merchant.lightningAddress) throw new Error('Merchant has no Lightning address')

  const r = getRedis()
  const indexKey = orderIndexKey(shop, orderIdRaw)
  const existingId = await r.get<string>(indexKey)
  if (existingId) {
    const existing = await getPaymentFromKv(existingId)
    if (existing && existing.status !== 'expired') return existing
  }

  const order = await getOrder(shop, install.accessToken, orderIdRaw)
  if (order.financial_status === 'paid') return null

  const amountSats = await convertToSats(parseFloat(order.total_price), order.currency)
  const lnurlInfo = await fetchLnurlPayInfo(merchant.lightningAddress)
  const msats = satsToMsats(amountSats)
  if (msats < lnurlInfo.minSendable || msats > lnurlInfo.maxSendable) {
    throw new Error(`Order amount (${amountSats} sats) is outside the merchant's accepted range`)
  }

  const description = `Shopify order ${order.name}`
  const invoiceResponse = await requestInvoice(lnurlInfo.callback, msats, description, PAYMENT_EXPIRY_SECS)
  const paymentId = randomUUID()
  const now = new Date()
  const payment: ServerPayment = {
    id: paymentId,
    merchantId: merchant.id,
    amountMsats: msats,
    amountSats,
    description,
    invoice: invoiceResponse.pr,
    verifyUrl: invoiceResponse.verify || null,
    status: 'pending',
    metadata: {
      source: 'shopify',
      shop,
      orderId: orderIdRaw,
      orderName: order.name,
      orderTotal: order.total_price,
      orderCurrency: order.currency,
      orderStatusUrl: order.order_status_url || null,
    },
    createdAt: now.toISOString(),
    paidAt: null,
    expiresAt: new Date(now.getTime() + PAYMENT_EXPIRY_SECS * 1000).toISOString(),
  }
  await savePaymentToKv(payment)
  await r.set(indexKey, paymentId, { ex: PAYMENT_EXPIRY_SECS + 60 })
  return payment
}

async function convertToSats(amount: number, currency: string): Promise<number> {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Invalid order amount')
  const cur = currency.toUpperCase()
  if (cur === 'BTC') return Math.round(amount * 100_000_000)
  if (cur === 'SATS') return Math.round(amount)
  const res = await fetch(`https://api.yadio.io/exrates/BTC`)
  if (!res.ok) throw new Error(`Yadio rate fetch failed: ${res.status}`)
  const json = (await res.json()) as { BTC: Record<string, number> }
  const rate = json.BTC?.[cur]
  if (!rate || !Number.isFinite(rate)) throw new Error(`No BTC/${cur} rate available`)
  return Math.round((amount / rate) * 100_000_000)
}

// ---- SVG composition ----

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'

async function pendingSvg(amountSats: number, invoice: string): Promise<string> {
  const qrSvg = await QRCode.toString(invoice.toUpperCase(), {
    type: 'svg',
    margin: 0,
    errorCorrectionLevel: 'M',
  })
  const inner = qrSvg.replace(/<\?xml[^>]+\?>/, '').replace(/<svg[^>]*>/, '').replace(/<\/svg>/, '').trim()
  const vbMatch = qrSvg.match(/viewBox="([^"]+)"/)
  const vb = vbMatch?.[1] || '0 0 41 41'
  const sats = amountSats.toLocaleString()
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 380 500" width="380" height="500">
  <rect x="1" y="1" width="378" height="498" rx="14" fill="#ffffff" stroke="#e5e7eb"/>
  <text x="190" y="46" text-anchor="middle" font-family="${FONT}" font-size="18" font-weight="600" fill="#111827">Pay with Bitcoin / Lightning</text>
  <text x="190" y="74" text-anchor="middle" font-family="${FONT}" font-size="14" fill="#6b7280">${sats} sats</text>
  <g transform="translate(50,100)">
    <rect width="280" height="280" fill="#ffffff"/>
    <svg width="280" height="280" viewBox="${vb}" preserveAspectRatio="xMidYMid meet">${inner}</svg>
  </g>
  <circle cx="180" cy="430" r="5" fill="#a855f7">
    <animate attributeName="opacity" values="1;0.3;1" dur="1.4s" repeatCount="indefinite"/>
  </circle>
  <text x="200" y="434" text-anchor="start" font-family="${FONT}" font-size="14" fill="#6b7280">Waiting for payment…</text>
  <text x="190" y="466" text-anchor="middle" font-family="${FONT}" font-size="11" fill="#9ca3af">Scan with any Lightning wallet</text>
</svg>`
}

function paidSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 380 200" width="380" height="200">
  <rect x="1" y="1" width="378" height="198" rx="14" fill="#f0fdf4" stroke="#86efac"/>
  <circle cx="190" cy="80" r="32" fill="#22c55e"/>
  <path d="M174 80 l12 12 l24 -24" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="190" y="146" text-anchor="middle" font-family="${FONT}" font-size="18" font-weight="600" fill="#166534">Payment received</text>
  <text x="190" y="172" text-anchor="middle" font-family="${FONT}" font-size="13" fill="#166534">Your order is being marked as paid.</text>
</svg>`
}

function expiredSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 380 180" width="380" height="180">
  <rect x="1" y="1" width="378" height="178" rx="14" fill="#fef2f2" stroke="#fca5a5"/>
  <text x="190" y="80" text-anchor="middle" font-family="${FONT}" font-size="18" font-weight="600" fill="#991b1b">Invoice expired</text>
  <text x="190" y="110" text-anchor="middle" font-family="${FONT}" font-size="13" fill="#991b1b">Refresh the page to generate a new one.</text>
</svg>`
}

function errorSvg(msg: string): string {
  const safe = msg.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] as string))
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 380 180" width="380" height="180">
  <rect x="1" y="1" width="378" height="178" rx="14" fill="#fef2f2" stroke="#fca5a5"/>
  <text x="190" y="80" text-anchor="middle" font-family="${FONT}" font-size="16" font-weight="600" fill="#991b1b">Bitcoin / Lightning unavailable</text>
  <text x="190" y="110" text-anchor="middle" font-family="${FONT}" font-size="12" fill="#991b1b">${safe}</text>
</svg>`
}
