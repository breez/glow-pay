import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getMerchantByApiKey } from '../_lib/redis.js'
import { getInstallation, isValidShopDomain, saveInstallation } from '../_lib/shopify.js'

/**
 * Binds a Shopify shop installation to a glow-pay merchant by API key.
 * Called from the post-OAuth HTML page rendered by callback.ts.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { shop, apiKey } = req.body ?? {}
  if (!isValidShopDomain(typeof shop === 'string' ? shop : undefined)) {
    return res.status(400).json({ error: 'Invalid shop domain' })
  }
  if (!apiKey || typeof apiKey !== 'string') {
    return res.status(400).json({ error: 'Missing apiKey' })
  }

  const merchant = await getMerchantByApiKey(apiKey)
  if (!merchant) {
    return res.status(401).json({ error: 'Invalid Glow Pay API key' })
  }

  const install = await getInstallation(shop)
  if (!install) {
    return res.status(404).json({ error: 'Shopify installation not found — please reinstall the app' })
  }

  await saveInstallation({
    ...install,
    merchantId: merchant.id,
    apiKey,
  })

  return res.status(200).json({ success: true, merchantId: merchant.id, storeName: merchant.storeName })
}
