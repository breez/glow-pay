import type { VercelRequest, VercelResponse } from '@vercel/node'
import { saveMerchantToKv, getMerchantById } from './_lib/redis.js'
import type { ServerMerchant } from './_lib/redis.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { merchantId, apiKey, apiKeys, storeName, lightningAddresses, redirectUrl, rotationEnabled, rotationCount, webhookUrl, webhookSecret, brandColor, logoUrl } = req.body ?? {}

  if (!merchantId || (!apiKey && !apiKeys?.length) || !lightningAddresses?.length) {
    return res.status(400).json({ error: 'Missing required fields: merchantId, apiKey/apiKeys, lightningAddresses' })
  }

  // Get existing merchant to find old API keys for cleanup
  const existing = await getMerchantById(merchantId)
  const oldApiKeys = existing?.apiKeys?.map(k => k.key) ?? (existing?.apiKey ? [existing.apiKey] : undefined)

  // Build apiKeys array from either new format or backward-compat single key
  const resolvedApiKeys = apiKeys?.length > 0
    ? apiKeys
    : [{ key: apiKey, label: 'Default', active: true }]

  const firstActiveKey = resolvedApiKeys.find((k: { active: boolean }) => k.active)?.key || apiKey

  const merchant: ServerMerchant = {
    id: merchantId,
    storeName: storeName || '',
    lightningAddress: lightningAddresses[0],
    lightningAddresses,
    redirectUrl: redirectUrl || null,
    apiKey: firstActiveKey,
    apiKeys: resolvedApiKeys,
    rotationEnabled: rotationEnabled ?? false,
    rotationCount: rotationCount ?? 5,
    webhookUrl: webhookUrl || null,
    webhookSecret: webhookSecret || null,
    brandColor: brandColor || null,
    logoUrl: logoUrl || null,
    registeredAt: existing?.registeredAt || new Date().toISOString(),
  }

  await saveMerchantToKv(merchant, oldApiKeys)

  return res.status(200).json({ success: true, merchantId })
}
