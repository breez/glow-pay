import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getPaymentFromKv, savePaymentToKv, getMerchantById } from '../_lib/redis.js'
import { verifyPayment } from '../../src/lib/lnurl.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
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

  // Live LNURL-verify check if still pending
  if (payment.status === 'pending' && payment.verifyUrl) {
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
  }

  // Fetch merchant for display info
  const merchant = await getMerchantById(payment.merchantId)

  return res.status(200).json({
    success: true,
    data: {
      id: payment.id,
      amountSats: payment.amountSats,
      description: payment.description,
      invoice: payment.invoice,
      status: payment.status,
      createdAt: payment.createdAt,
      expiresAt: payment.expiresAt,
      paidAt: payment.paidAt,
      verifyUrl: payment.verifyUrl,
      merchant: merchant
        ? { storeName: merchant.storeName, redirectUrl: merchant.redirectUrl }
        : null,
    },
  })
}
