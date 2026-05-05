import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getPaymentFromKv, getRedis } from '../_lib/redis.js'
import { isValidShopDomain } from '../_lib/shopify.js'

const orderIndexKey = (shop: string, orderId: string) => `shopify:order:${shop}:${orderId}`

/**
 * Server-side redirect helper used by the Shopify extension to give
 * customers an "Open in wallet" link without the extension itself
 * having to read the BOLT11 invoice (which would require fetch /
 * network_access). The extension links to this URL; we look up the
 * payment for the order and 302 to `lightning:<bolt11>`.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const shop = typeof req.query.shop === 'string' ? req.query.shop : undefined
  const orderIdRaw = typeof req.query.order === 'string' ? req.query.order : undefined

  if (!isValidShopDomain(shop)) return res.status(400).send('Invalid shop domain.')
  if (!orderIdRaw || !/^\d+$/.test(orderIdRaw)) return res.status(400).send('Invalid order id.')

  const r = getRedis()
  const paymentId = await r.get<string>(orderIndexKey(shop, orderIdRaw))
  if (!paymentId) return res.status(404).send('No active invoice — refresh the order page.')

  const payment = await getPaymentFromKv(paymentId)
  if (!payment?.invoice) return res.status(404).send('Invoice not found or expired — refresh the order page.')

  res.setHeader('Cache-Control', 'no-store')
  return res.redirect(302, `lightning:${payment.invoice}`)
}
