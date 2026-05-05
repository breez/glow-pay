import type { VercelRequest, VercelResponse } from '@vercel/node'
import { deleteInstallation, verifyWebhookHmac } from '../../_lib/shopify.js'

export const config = { api: { bodyParser: false } }

async function readRawBody(req: VercelRequest): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).end()
  }

  const secret = process.env.SHOPIFY_CLIENT_SECRET
  if (!secret) return res.status(500).end()

  const rawBody = await readRawBody(req)
  const hmacHeader = req.headers['x-shopify-hmac-sha256']
  const headerValue = Array.isArray(hmacHeader) ? hmacHeader[0] : hmacHeader

  if (!verifyWebhookHmac(rawBody, headerValue, secret)) {
    return res.status(401).end()
  }

  const shop = req.headers['x-shopify-shop-domain']
  const shopDomain = Array.isArray(shop) ? shop[0] : shop
  if (shopDomain) {
    await deleteInstallation(shopDomain)
  }

  return res.status(200).end()
}
