import type { VercelRequest, VercelResponse } from '@vercel/node'
import { saveMerchantToKv } from './_lib/redis.js'
import type { ServerMerchant } from './_lib/redis.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { merchantId, apiKey, storeName, lightningAddresses, redirectUrl } = req.body ?? {}

  if (!merchantId || !apiKey || !lightningAddresses?.length) {
    return res.status(400).json({ error: 'Missing required fields: merchantId, apiKey, lightningAddresses' })
  }

  const merchant: ServerMerchant = {
    id: merchantId,
    storeName: storeName || '',
    lightningAddress: lightningAddresses[0],
    lightningAddresses,
    redirectUrl: redirectUrl || null,
    apiKey,
    registeredAt: new Date().toISOString(),
  }

  await saveMerchantToKv(merchant)

  return res.status(200).json({ success: true, merchantId })
}
