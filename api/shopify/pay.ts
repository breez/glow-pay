import type { VercelRequest, VercelResponse } from '@vercel/node'
import { randomUUID } from 'crypto'
import { getMerchantByApiKey, savePaymentToKv, type ServerPayment } from '../_lib/redis.js'
import { getInstallation, getOrder, isValidShopDomain } from '../_lib/shopify.js'
import { fetchLnurlPayInfo, requestInvoice, satsToMsats } from '../../src/lib/lnurl.js'

const PAYMENT_EXPIRY_SECS = 600

/**
 * Customer-facing endpoint. The merchant places a link to this URL in
 * their Shopify order confirmation email or order status page:
 *
 *   https://glow-pay.co/api/shopify/pay?shop={{ shop.permanent_domain }}&order={{ order.id }}
 *
 * We look up the Shopify install, fetch the order via Admin API to confirm
 * it's unpaid, fetch a live BTC rate to convert the order total, create a
 * glow-pay payment with Shopify metadata, and 302-redirect to the checkout.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const shop = typeof req.query.shop === 'string' ? req.query.shop : undefined
  const orderIdRaw = typeof req.query.order === 'string' ? req.query.order : undefined

  if (!isValidShopDomain(shop)) {
    return res.status(400).send('Invalid shop domain.')
  }
  if (!orderIdRaw || !/^\d+$/.test(orderIdRaw)) {
    return res.status(400).send('Missing or invalid order id.')
  }

  const install = await getInstallation(shop)
  if (!install) {
    return res.status(404).send('Shopify store not connected — the merchant needs to reinstall Glow Pay.')
  }
  if (!install.apiKey || !install.merchantId) {
    return res.status(409).send('Shopify store is installed but not yet linked to a Glow Pay account.')
  }

  const merchant = await getMerchantByApiKey(install.apiKey)
  if (!merchant) {
    return res.status(401).send('Linked Glow Pay account is invalid — the merchant needs to relink the store.')
  }

  let order
  try {
    order = await getOrder(shop, install.accessToken, orderIdRaw)
  } catch (err) {
    console.error('Shopify getOrder failed:', err)
    return res.status(502).send('Could not fetch order from Shopify.')
  }

  if (order.financial_status === 'paid') {
    if (order.order_status_url) return res.redirect(302, order.order_status_url)
    return res.status(200).send('This order has already been paid.')
  }

  let amountSats: number
  try {
    amountSats = await convertToSats(parseFloat(order.total_price), order.currency)
  } catch (err) {
    console.error('Currency conversion failed:', err)
    return res.status(502).send('Could not convert order amount to sats.')
  }

  if (!merchant.lightningAddress) {
    return res.status(409).send('Merchant has no Lightning address configured.')
  }

  try {
    const lnurlInfo = await fetchLnurlPayInfo(merchant.lightningAddress)
    const msats = satsToMsats(amountSats)
    if (msats < lnurlInfo.minSendable || msats > lnurlInfo.maxSendable) {
      return res.status(400).send(`Order amount (${amountSats} sats) is outside the merchant's accepted range.`)
    }

    const description = `Shopify order ${order.name}`
    const invoiceResponse = await requestInvoice(lnurlInfo.callback, msats, description, PAYMENT_EXPIRY_SECS)
    const verifyUrl = invoiceResponse.verify || null

    const paymentId = randomUUID()
    const now = new Date()
    const payment: ServerPayment = {
      id: paymentId,
      merchantId: merchant.id,
      amountMsats: msats,
      amountSats,
      description,
      invoice: invoiceResponse.pr,
      verifyUrl,
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
  const btcAmount = amount / rate
  return Math.round(btcAmount * 100_000_000)
}
