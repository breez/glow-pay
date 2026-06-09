import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getPaymentFromKv, savePaymentToKv, getMerchantById, getMerchantByApiKey, acquireSettleLock } from '../_lib/redis.js'
import { sendWebhook } from '../_lib/webhook.js'
import { getInstallation, markOrderPaid } from '../_lib/shopify.js'
import { verifyPayment } from '../../src/lib/lnurl.js'

async function settleShopifyOrder(metadata: Record<string, unknown> | null): Promise<void> {
  if (!metadata || metadata.source !== 'shopify') return
  const shop = typeof metadata.shop === 'string' ? metadata.shop : null
  const orderId = typeof metadata.orderId === 'string' ? metadata.orderId : null
  const total = typeof metadata.orderTotal === 'string' ? metadata.orderTotal : null
  const currency = typeof metadata.orderCurrency === 'string' ? metadata.orderCurrency : null
  if (!shop || !orderId || !total || !currency) return

  const install = await getInstallation(shop)
  if (!install) {
    console.warn(`Shopify settle skipped: no installation for ${shop}`)
    return
  }
  await markOrderPaid(shop, install.accessToken, orderId, total, currency)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method === 'PATCH') {
    return handlePatch(req, res)
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { id } = req.query
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Missing payment ID' })
  }

  const payment = await getPaymentFromKv(id)
  if (!payment) {
    return res.status(404).json({ error: 'Payment not found' })
  }

  // Fetch merchant early — needed for webhooks and branding in response
  const merchant = await getMerchantById(payment.merchantId)

  // Live LNURL-verify check if still pending
  if (payment.status === 'pending' && payment.verifyUrl) {
    // Decide the target transition first (read-only), then settle under a lock.
    let target: 'completed' | 'expired' | null = null
    let paidAt: string | null = null
    try {
      const result = await verifyPayment(payment.verifyUrl)
      if (result.settled) {
        target = 'completed'
        paidAt = new Date().toISOString()
      } else if (new Date(payment.expiresAt) < new Date()) {
        target = 'expired'
      }
    } catch (err) {
      console.warn('LNURL-verify check failed:', err)
    }

    if (target) {
      // Only the lock winner persists the transition and fires side-effects;
      // concurrent polls reflect the outcome without double-firing Shopify/webhook.
      const gotLock = await acquireSettleLock(payment.id)
      if (gotLock) {
        // Re-read under the lock so we never overwrite a status another request
        // (or the PATCH endpoint) already moved off 'pending'.
        const fresh = await getPaymentFromKv(payment.id)
        if (fresh && fresh.status === 'pending') {
          payment.status = target
          if (target === 'completed') payment.paidAt = paidAt
          await savePaymentToKv(payment)
          if (target === 'completed') {
            settleShopifyOrder(payment.metadata).catch(err => console.error('Shopify settle failed:', err))
          }
          if (merchant?.webhookUrl && merchant?.webhookSecret) {
            sendWebhook(merchant.webhookUrl, merchant.webhookSecret,
              target === 'completed' ? 'payment.completed' : 'payment.expired',
              { paymentId: payment.id, amountSats: payment.amountSats, status: payment.status, paidAt: payment.paidAt },
            ).catch(() => {})
          }
        } else if (fresh) {
          // Already transitioned by a concurrent request — reflect, don't re-fire.
          payment.status = fresh.status
          payment.paidAt = fresh.paidAt
        }
      } else {
        // Lost the lock: settlement is happening elsewhere. verifyPayment already
        // confirmed the truth, so reflect it for this response without side-effects.
        payment.status = target
        if (target === 'completed' && !payment.paidAt) payment.paidAt = paidAt
      }
    }
  }

  return res.status(200).json({
    success: true,
    data: {
      id: payment.id,
      amountSats: payment.amountSats,
      description: payment.description,
      invoice: payment.invoice,
      status: payment.status,
      type: payment.type || 'incoming',
      createdAt: payment.createdAt,
      expiresAt: payment.expiresAt,
      paidAt: payment.paidAt,
      verifyUrl: payment.verifyUrl,
      metadata: payment.metadata || null,
      merchant: merchant
        ? { storeName: merchant.storeName, redirectUrl: merchant.redirectUrl, brandColor: merchant.brandColor || null, brandBackground: merchant.brandBackground || null, logoUrl: merchant.logoUrl || null }
        : null,
    },
  })
}

async function handlePatch(req: VercelRequest, res: VercelResponse) {
  const apiKey = req.headers['x-api-key'] as string
  if (!apiKey) {
    return res.status(401).json({ error: 'Missing X-API-Key header' })
  }

  const merchant = await getMerchantByApiKey(apiKey)
  if (!merchant) {
    return res.status(401).json({ error: 'Invalid API key' })
  }

  const { id } = req.query
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Missing payment ID' })
  }

  const payment = await getPaymentFromKv(id)
  if (!payment) {
    return res.status(404).json({ error: 'Payment not found' })
  }

  if (payment.merchantId !== merchant.id) {
    return res.status(403).json({ error: 'Payment does not belong to this merchant' })
  }

  const { status } = req.body ?? {}
  if (status !== 'expired') {
    return res.status(400).json({ error: 'status must be "expired"' })
  }

  // Only expire a still-pending payment, and do it under the settlement lock so
  // a concurrent GET that's completing the same payment can't be clobbered.
  if (payment.status === 'pending') {
    const gotLock = await acquireSettleLock(payment.id)
    if (gotLock) {
      const fresh = await getPaymentFromKv(payment.id)
      if (fresh && fresh.status === 'pending') {
        payment.status = 'expired'
        await savePaymentToKv(payment)
        if (merchant.webhookUrl && merchant.webhookSecret) {
          sendWebhook(merchant.webhookUrl, merchant.webhookSecret, 'payment.expired',
            { paymentId: payment.id, amountSats: payment.amountSats, status: 'expired', paidAt: payment.paidAt },
          ).catch(() => {})
        }
      } else if (fresh) {
        payment.status = fresh.status
      }
    } else {
      // A concurrent settlement holds the lock; reflect latest persisted state.
      const fresh = await getPaymentFromKv(payment.id)
      if (fresh) payment.status = fresh.status
    }
  }

  return res.status(200).json({ success: true, data: { id: payment.id, status: payment.status } })
}
