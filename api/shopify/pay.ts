import type { VercelRequest, VercelResponse } from '@vercel/node'
import { randomUUID } from 'crypto'
import { getMerchantByApiKey, savePaymentToKv, getRedis, getPaymentFromKv, type ServerPayment } from '../_lib/redis.js'
import { getInstallation, isValidShopDomain } from '../_lib/shopify.js'
import { fetchLnurlPayInfo, requestInvoice, satsToMsats } from '../../src/lib/lnurl.js'

const PAYMENT_EXPIRY_SECS = 600
const orderIndexKey = (shop: string, orderId: string) => `shopify:order:${shop}:${orderId}`

/**
 * Customer-facing endpoint. The merchant places a link to this URL in
 * their Shopify order confirmation email:
 *
 *   https://glow-pay.co/api/shopify/pay
 *     ?shop={{ shop.permanent_domain }}
 *     &order={{ id }}
 *     &amount={{ total_price | divided_by: 100.0 }}
 *     &currency={{ currency }}
 *
 * We trust the URL params for amount/currency rather than calling
 * the Shopify Admin API (which would require "protected customer
 * data" approval). Idempotent per (shop, order). 302 to glow-pay
 * checkout.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const shop = typeof req.query.shop === 'string' ? req.query.shop : undefined
  const orderIdRaw = typeof req.query.order === 'string' ? req.query.order : undefined
  const amountStr = typeof req.query.amount === 'string' ? req.query.amount : undefined
  const currency = typeof req.query.currency === 'string' ? req.query.currency : undefined

  if (!isValidShopDomain(shop)) return res.status(400).send('Invalid shop domain.')
  if (!orderIdRaw || !/^\d+$/.test(orderIdRaw)) return res.status(400).send('Missing or invalid order id.')
  if (!amountStr || !currency) return res.status(400).send('Missing amount or currency.')

  const install = await getInstallation(shop)
  if (!install) return res.status(404).send('Shopify store not connected.')
  if (!install.apiKey || !install.merchantId) {
    return res.status(409).send('Store is not yet linked to a Glow Pay account.')
  }

  const merchant = await getMerchantByApiKey(install.apiKey)
  if (!merchant) return res.status(401).send('Linked Glow Pay account is invalid.')
  if (!merchant.lightningAddress) {
    return res.status(409).send('Merchant has no Lightning address configured.')
  }

  const r = getRedis()
  const indexKey = orderIndexKey(shop, orderIdRaw)
  const existingId = await r.get<string>(indexKey)
  if (existingId) {
    const existing = await getPaymentFromKv(existingId)
    if (existing && existing.status !== 'expired') {
      const baseUrl = `https://${req.headers.host}`
      return res.redirect(302, `${baseUrl}/pay/${merchant.id}/${existing.id}`)
    }
  }

  const amount = parseFloat(amountStr)
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).send('Invalid order amount.')

  let amountSats: number
  try {
    amountSats = await convertToSats(amount, currency)
  } catch (err) {
    console.error('Currency conversion failed:', err)
    return res.status(502).send('Could not convert order amount to sats.')
  }

  try {
    const lnurlInfo = await fetchLnurlPayInfo(merchant.lightningAddress)
    const msats = satsToMsats(amountSats)
    if (msats < lnurlInfo.minSendable || msats > lnurlInfo.maxSendable) {
      return res.status(400).send(`Order amount (${amountSats} sats) is outside the merchant's accepted range.`)
    }

    const description = `Shopify order #${orderIdRaw}`
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
      metadata: { source: 'shopify', shop, orderId: orderIdRaw, orderTotal: amountStr, orderCurrency: currency },
      createdAt: now.toISOString(),
      paidAt: null,
      expiresAt: new Date(now.getTime() + PAYMENT_EXPIRY_SECS * 1000).toISOString(),
    }
    await savePaymentToKv(payment)
    await r.set(indexKey, paymentId, { ex: PAYMENT_EXPIRY_SECS + 60 })

    const baseUrl = `https://${req.headers.host}`
    return res.redirect(302, `${baseUrl}/pay/${merchant.id}/${paymentId}`)
  } catch (err) {
    console.error('Shopify payment creation failed:', err)
    return res.status(500).send('Failed to create payment.')
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
