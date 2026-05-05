import type { VercelRequest, VercelResponse } from '@vercel/node'
import { randomBytes } from 'crypto'
import { isValidShopDomain, saveState, SHOPIFY_SCOPES } from '../_lib/shopify.js'

/**
 * Entry point for the Shopify OAuth flow. The merchant is sent here
 * either by Shopify (after clicking "Install" in the admin) or by us
 * with `?shop=xxx.myshopify.com`. We validate the shop domain, mint a
 * state nonce, and redirect to Shopify's authorize endpoint.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const shopRaw = req.query.shop
  const shop = typeof shopRaw === 'string' ? shopRaw : undefined
  if (!isValidShopDomain(shop)) {
    return res.status(400).send('Missing or invalid `shop` parameter — expected `xxx.myshopify.com`.')
  }

  const clientId = process.env.SHOPIFY_CLIENT_ID
  if (!clientId) {
    return res.status(500).send('Shopify integration is not configured (SHOPIFY_CLIENT_ID missing).')
  }

  const state = randomBytes(16).toString('hex')
  await saveState(state, shop)

  const host = Array.isArray(req.headers.host) ? req.headers.host[0] : req.headers.host
  const baseUrl = `https://${host}`
  const redirectUri = `${baseUrl}/api/shopify/callback`

  const authUrl = new URL(`https://${shop}/admin/oauth/authorize`)
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('scope', SHOPIFY_SCOPES)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('state', state)

  res.redirect(302, authUrl.toString())
}
