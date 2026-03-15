import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getMerchantByApiKey, savePaymentToKv } from '../_lib/redis.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = req.headers['x-api-key'] as string
  if (!apiKey) {
    return res.status(401).json({ error: 'Missing X-API-Key header' })
  }

  const merchant = await getMerchantByApiKey(apiKey)
  if (!merchant) {
    return res.status(401).json({ error: 'Invalid API key' })
  }

  const { amountSats, description } = req.body ?? {}
  if (!amountSats || typeof amountSats !== 'number' || amountSats < 1) {
    return res.status(400).json({ error: 'amountSats must be a positive integer' })
  }

  const now = new Date().toISOString()
  const paymentId = `sweep_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`

  await savePaymentToKv({
    id: paymentId,
    merchantId: merchant.id,
    amountMsats: amountSats * 1000,
    amountSats,
    description: description || null,
    invoice: null,
    verifyUrl: null,
    status: 'completed',
    type: 'sweep',
    metadata: null,
    createdAt: now,
    paidAt: now,
    expiresAt: now,
  })

  return res.status(201).json({
    success: true,
    data: { paymentId, amountSats, status: 'completed', type: 'sweep' },
  })
}
