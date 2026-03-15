import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getPaymentFromKv, savePaymentToKv, getMerchantById, getMerchantByApiKey } from '../_lib/redis.js'
import { sendWebhook } from '../_lib/webhook.js'
import { verifyPayment } from '../../src/lib/lnurl.js'

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
    const previousStatus = payment.status
    try {
      const result = await verifyPayment(payment.verifyUrl)
      if (result.settled) {
        payment.status = 'completed'
        payment.paidAt = new Date().toISOString()
        await savePaymentToKv(payment)
      } else if (new Date(payment.expiresAt) < new Date()) {
        payment.status = 'expired'
        await savePaymentToKv(payment)
      }
    } catch (err) {
      console.warn('LNURL-verify check failed:', err)
    }

    // Fire webhook on status change
    if (payment.status !== previousStatus && merchant?.webhookUrl && merchant?.webhookSecret) {
      sendWebhook(merchant.webhookUrl, merchant.webhookSecret,
        payment.status === 'completed' ? 'payment.completed' : 'payment.expired',
        { paymentId: payment.id, amountSats: payment.amountSats, status: payment.status, paidAt: payment.paidAt },
      ).catch(() => {})
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
  if (!status || !['completed', 'expired'].includes(status)) {
    return res.status(400).json({ error: 'status must be "completed" or "expired"' })
  }

  const previousStatus = payment.status
  payment.status = status
  if (status === 'completed' && !payment.paidAt) {
    payment.paidAt = new Date().toISOString()
  }
  await savePaymentToKv(payment)

  // Fire webhook on status change
  if (status !== previousStatus && merchant.webhookUrl && merchant.webhookSecret) {
    sendWebhook(merchant.webhookUrl, merchant.webhookSecret,
      status === 'completed' ? 'payment.completed' : 'payment.expired',
      { paymentId: payment.id, amountSats: payment.amountSats, status, paidAt: payment.paidAt },
    ).catch(() => {})
  }

  return res.status(200).json({ success: true, data: { id: payment.id, status: payment.status, paidAt: payment.paidAt } })
}
