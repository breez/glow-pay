import { createHmac, timingSafeEqual } from 'crypto'
import { getRedis } from './redis.js'

export const SHOPIFY_API_VERSION = '2024-10'
export const SHOPIFY_SCOPES = 'read_orders,write_orders'

export interface ShopifyInstallation {
  shop: string
  accessToken: string
  scope: string
  merchantId?: string
  apiKey?: string
  installedAt: string
}

const installKey = (shop: string) => `shopify:shop:${shop}`
const stateKey = (state: string) => `shopify:state:${state}`

export async function saveInstallation(install: ShopifyInstallation): Promise<void> {
  await getRedis().set(installKey(install.shop), install)
}

export async function getInstallation(shop: string): Promise<ShopifyInstallation | null> {
  return getRedis().get<ShopifyInstallation>(installKey(shop))
}

export async function deleteInstallation(shop: string): Promise<void> {
  await getRedis().del(installKey(shop))
}

export async function saveState(state: string, shop: string): Promise<void> {
  await getRedis().set(stateKey(state), shop, { ex: 600 })
}

export async function consumeState(state: string): Promise<string | null> {
  const r = getRedis()
  const shop = await r.get<string>(stateKey(state))
  if (shop) await r.del(stateKey(state))
  return shop
}

/**
 * Validates a shop domain (must be xxx.myshopify.com) — prevents
 * open-redirect attacks where an attacker passes a different host.
 */
export function isValidShopDomain(shop: string | undefined): shop is string {
  if (!shop || typeof shop !== 'string') return false
  return /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop)
}

/**
 * Verifies the HMAC param Shopify includes on OAuth redirects.
 * https://shopify.dev/docs/apps/auth/oauth/getting-started#step-3-verify-the-installation-request
 */
export function verifyOAuthHmac(query: Record<string, string | string[] | undefined>, secret: string): boolean {
  const { hmac, signature, ...rest } = query
  if (!hmac || typeof hmac !== 'string') return false

  const message = Object.keys(rest)
    .sort()
    .map(key => {
      const value = rest[key]
      const v = Array.isArray(value) ? value.join(',') : value ?? ''
      return `${key}=${v}`
    })
    .join('&')

  const computed = createHmac('sha256', secret).update(message).digest('hex')
  const a = Buffer.from(computed, 'utf8')
  const b = Buffer.from(hmac, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Verifies the X-Shopify-Hmac-Sha256 header on webhook deliveries.
 * The HMAC is computed over the raw body bytes.
 */
export function verifyWebhookHmac(rawBody: string | Buffer, hmacHeader: string | undefined, secret: string): boolean {
  if (!hmacHeader) return false
  const computed = createHmac('sha256', secret).update(rawBody).digest('base64')
  const a = Buffer.from(computed, 'utf8')
  const b = Buffer.from(hmacHeader, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function exchangeCodeForToken(shop: string, code: string, clientId: string, clientSecret: string) {
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  })
  if (!res.ok) {
    throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`)
  }
  return res.json() as Promise<{ access_token: string; scope: string }>
}

interface ShopifyOrder {
  id: number
  name: string
  financial_status: string | null
  total_price: string
  currency: string
  email?: string | null
  order_status_url?: string | null
}

export async function getOrder(shop: string, accessToken: string, orderId: string | number): Promise<ShopifyOrder> {
  const res = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/orders/${orderId}.json`, {
    headers: { 'X-Shopify-Access-Token': accessToken },
  })
  if (!res.ok) {
    throw new Error(`Get order failed: ${res.status} ${await res.text()}`)
  }
  const json = (await res.json()) as { order: ShopifyOrder }
  return json.order
}

/**
 * Marks a Shopify order paid by creating a successful sale transaction.
 * Works for orders placed via manual payment methods.
 */
export async function markOrderPaid(shop: string, accessToken: string, orderId: string | number, amount: string, currency: string): Promise<void> {
  const res = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/orders/${orderId}/transactions.json`, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      transaction: { kind: 'sale', status: 'success', amount, currency, gateway: 'Glow Pay (Bitcoin/Lightning)' },
    }),
  })
  if (!res.ok) {
    throw new Error(`Mark order paid failed: ${res.status} ${await res.text()}`)
  }
}

export async function registerUninstallWebhook(shop: string, accessToken: string, callbackUrl: string): Promise<void> {
  const res = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/webhooks.json`, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      webhook: { topic: 'app/uninstalled', address: callbackUrl, format: 'json' },
    }),
  })
  if (!res.ok && res.status !== 422) {
    throw new Error(`Webhook register failed: ${res.status} ${await res.text()}`)
  }
}
