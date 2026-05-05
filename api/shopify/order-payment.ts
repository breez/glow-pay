import type { VercelRequest, VercelResponse } from '@vercel/node'
import { randomUUID } from 'crypto'
import {
  getMerchantByApiKey,
  getPaymentFromKv,
  savePaymentToKv,
  type ServerPayment,
} from '../_lib/redis.js'
import { getInstallation, getOrder, isValidShopDomain } from '../_lib/shopify.js'
import { getRedis } from '../_lib/redis.js'
import { fetchLnurlPayInfo, requestInvoice, satsToMsats } from '../../src/lib/lnurl.js'

const PAYMENT_EXPIRY_SECS = 600

const orderIndexKey = (shop: string, orderId: string) => `shopify:order:${shop}:${orderId}`

/**
 * JSON sibling of /api/shopify/pay — returns payment data instead of
 * redirecting. Used by the in-page Shopify embed to render a QR code
 * directly on the order status page.
 *
 * Idempotent: a second call with the same shop+order returns the
 * existing payment (unless it expired, in which case a new one is
 * created and the index is updated).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const shop = typeof req.query.shop === 'string' ? req.query.shop : undefined
  const orderIdRaw = typeof req.query.order === 'string' ? req.query.order : undefined

  if (!isValidShopDomain(shop)) {
    return res.status(400).json({ error: 'Invalid shop domain' })
  }
  if (!orderIdRaw || !/^\d+$/.test(orderIdRaw)) {
    return res.status(400).json({ error: 'Missing or invalid order id' })
  }

  const install = await getInstallation(shop)
  if (!install) return res.status(404).json({ error: 'Shopify store not connected' })
  if (!install.apiKey || !install.merchantId) {
    return res.status(409).json({ error: 'Shopify store is not yet linked to a Glow Pay account' })
  }

  const merchant = await getMerchantByApiKey(install.apiKey)
  if (!merchant) return res.status(401).json({ error: 'Linked Glow Pay account is invalid' })
  if (!merchant.lightningAddress) {
    return res.status(409).json({ error: 'Merchant has no Lightning address configured' })
  }

  const r = getRedis()
  const indexKey = orderIndexKey(shop, orderIdRaw)
  const existingId = await r.get<string>(indexKey)

  if (existingId) {
    const existing = await getPaymentFromKv(existingId)
    if (existing && existing.status !== 'expired') {
      return res.status(200).json({ success: true, data: serialize(existing, merchant.id) })
    }
  }

  let order
  try {
    order = await getOrder(shop, install.accessToken, orderIdRaw)
  } catch (err) {
    console.error('Shopify getOrder failed:', err)
    return res.status(502).json({ error: 'Could not fetch order from Shopify' })
  }

  if (order.financial_status === 'paid') {
    return res.status(200).json({
      success: true,
      data: { paid: true, orderStatusUrl: order.order_status_url || null },
    })
  }

  let amountSats: number
  try {
    amountSats = await convertToSats(parseFloat(order.total_price), order.currency)
  } catch (err) {
    console.error('Currency conversion failed:', err)
    return res.status(502).json({ error: 'Could not convert order amount to sats' })
  }

  try {
    const lnurlInfo = await fetchLnurlPayInfo(merchant.lightningAddress)
    const msats = satsToMsats(amountSats)
    if (msats < lnurlInfo.minSendable || msats > lnurlInfo.maxSendable) {
      return res.status(400).json({
        error: `Order amount (${amountSats} sats) is outside the merchant's accepted range`,
      })
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

    return res.status(200).json({ success: true, data: serialize(payment, merchant.id) })
  } catch (err) {
    console.error('Shopify order-payment creation failed:', err)
    return res.status(500).json({ error: 'Failed to create payment' })
  }
}

function serialize(payment: ServerPayment, merchantId: string) {
  return {
    paymentId: payment.id,
    merchantId,
    invoice: payment.invoice,
    amountSats: payment.amountSats,
    status: payment.status,
    expiresAt: payment.expiresAt,
    paidAt: payment.paidAt,
  }
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
