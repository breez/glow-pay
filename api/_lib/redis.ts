import { Redis } from '@upstash/redis'

let redis: Redis | null = null

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis({
      url: process.env.KV_REST_API_URL!,
      token: process.env.KV_REST_API_TOKEN!,
    })
  }
  return redis
}

// Merchant helpers

export interface ServerApiKey {
  key: string
  label: string
  active: boolean
}

export interface ServerMerchant {
  id: string
  storeName: string
  lightningAddress: string
  redirectUrl: string | null
  apiKey: string // backward compat — first active key
  apiKeys: ServerApiKey[]
  webhookUrl?: string | null
  webhookSecret?: string | null
  brandColor?: string | null
  brandBackground?: string | null
  logoUrl?: string | null
  authTokenHash?: string // SHA-256 hash of auth token derived from mnemonic
  registeredAt: string
}

export async function getMerchantByApiKey(apiKey: string): Promise<ServerMerchant | null> {
  const r = getRedis()
  const merchantId = await r.get<string>(`apikey:${apiKey}`)
  if (!merchantId) return null
  const merchant = await r.get<ServerMerchant>(`merchant:${merchantId}`)
  if (!merchant) return null
  // Verify the key is still active
  if (merchant.apiKeys?.length > 0) {
    const key = merchant.apiKeys.find(k => k.key === apiKey)
    if (key && !key.active) return null
  }
  return merchant
}

export async function getMerchantById(id: string): Promise<ServerMerchant | null> {
  return getRedis().get<ServerMerchant>(`merchant:${id}`)
}

export async function saveMerchantToKv(merchant: ServerMerchant, oldApiKeys?: string[]): Promise<void> {
  const r = getRedis()
  await r.set(`merchant:${merchant.id}`, merchant)

  // Remove old API key mappings
  if (oldApiKeys) {
    for (const oldKey of oldApiKeys) {
      await r.del(`apikey:${oldKey}`)
    }
  }

  // Set mappings for all active API keys
  if (merchant.apiKeys?.length > 0) {
    for (const k of merchant.apiKeys) {
      if (k.active) {
        await r.set(`apikey:${k.key}`, merchant.id)
      } else {
        await r.del(`apikey:${k.key}`)
      }
    }
  } else {
    // Backward compat: single apiKey
    await r.set(`apikey:${merchant.apiKey}`, merchant.id)
  }
}

// Payment helpers

export interface ServerPayment {
  id: string
  merchantId: string
  amountMsats: number
  amountSats: number
  description: string | null
  invoice: string | null
  verifyUrl: string | null
  status: 'pending' | 'completed' | 'expired'
  type?: 'incoming' | 'sweep'
  metadata: Record<string, unknown> | null
  createdAt: string
  paidAt: string | null
  expiresAt: string
}

export async function getPaymentFromKv(paymentId: string): Promise<ServerPayment | null> {
  return getRedis().get<ServerPayment>(`payment:${paymentId}`)
}

export async function savePaymentToKv(payment: ServerPayment): Promise<void> {
  const r = getRedis()
  // Completed payments get 30-day TTL, others 24h
  const ttl = payment.status === 'completed' ? 30 * 86400 : 86400
  await r.set(`payment:${payment.id}`, payment, { ex: ttl })
  // Index by merchant for dashboard listing
  await r.zadd(`merchant_payments:${payment.merchantId}`, {
    score: new Date(payment.createdAt).getTime(),
    member: payment.id,
  })
}

export async function getPaymentsByMerchant(merchantId: string, limit = 100): Promise<ServerPayment[]> {
  const r = getRedis()
  const ids = await r.zrange(`merchant_payments:${merchantId}`, 0, limit - 1, { rev: true })
  if (!ids.length) return []
  const keys = (ids as string[]).map(id => `payment:${id}`)
  const payments = await r.mget<(ServerPayment | null)[]>(...keys)
  return payments.filter((p): p is ServerPayment => p !== null)
}
