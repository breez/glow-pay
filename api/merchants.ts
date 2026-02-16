import type { VercelRequest, VercelResponse } from '@vercel/node'
import { saveMerchantToKv, getMerchantById } from './_lib/redis.js'
import type { ServerMerchant } from './_lib/redis.js'
import { hashAuthToken } from './_lib/auth.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method === 'GET') {
    return handleGet(req, res)
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  return handlePost(req, res)
}

// GET /api/merchants?id=<merchantId> — restore merchant config (auth required)
async function handleGet(req: VercelRequest, res: VercelResponse) {
  const merchantId = req.query.id as string | undefined
  if (!merchantId) {
    return res.status(400).json({ error: 'Missing id query param' })
  }

  const authToken = extractBearerToken(req)
  if (!authToken) {
    return res.status(401).json({ error: 'Missing Authorization header' })
  }

  const merchant = await getMerchantById(merchantId)
  if (!merchant) {
    return res.status(404).json({ error: 'Merchant not found' })
  }

  // Verify auth token
  if (!merchant.authTokenHash || merchant.authTokenHash !== hashAuthToken(authToken)) {
    return res.status(403).json({ error: 'Invalid auth token' })
  }

  // Return config (exclude authTokenHash)
  const { authTokenHash: _, ...config } = merchant
  return res.status(200).json({ success: true, data: config })
}

// POST /api/merchants — sync merchant config (auth required for existing merchants)
async function handlePost(req: VercelRequest, res: VercelResponse) {
  const { merchantId, apiKey, apiKeys, storeName, lightningAddresses, redirectUrl, rotationEnabled, rotationCount, webhookUrl, webhookSecret, brandColor, brandBackground, logoUrl } = req.body ?? {}

  if (!merchantId || (!apiKey && !apiKeys?.length) || !lightningAddresses?.length) {
    return res.status(400).json({ error: 'Missing required fields: merchantId, apiKey/apiKeys, lightningAddresses' })
  }

  const authToken = extractBearerToken(req)

  // Get existing merchant to find old API keys for cleanup
  const existing = await getMerchantById(merchantId)

  if (existing) {
    // Existing merchant — must authenticate
    if (!authToken) {
      return res.status(401).json({ error: 'Missing Authorization header' })
    }
    if (existing.authTokenHash && existing.authTokenHash !== hashAuthToken(authToken)) {
      return res.status(403).json({ error: 'Invalid auth token' })
    }
  } else {
    // New merchant — auth token required for initial registration
    if (!authToken) {
      return res.status(401).json({ error: 'Missing Authorization header' })
    }
  }

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
    brandBackground: brandBackground || null,
    logoUrl: logoUrl || null,
    authTokenHash: authToken ? hashAuthToken(authToken) : existing?.authTokenHash,
    registeredAt: existing?.registeredAt || new Date().toISOString(),
  }

  await saveMerchantToKv(merchant, oldApiKeys)

  return res.status(200).json({ success: true, merchantId })
}

function extractBearerToken(req: VercelRequest): string | null {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) return null
  return header.slice(7)
}
