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
  posEnabled?: boolean
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
  // Run the merchant record + all apikey mappings in one transaction so a
  // partial failure can't leave a revoked key still valid or a new key dead.
  // MULTI preserves command order, so del-then-set is safe when a key is reused.
  const tx = r.multi()
  tx.set(`merchant:${merchant.id}`, merchant)

  // Remove old API key mappings
  if (oldApiKeys) {
    for (const oldKey of oldApiKeys) {
      tx.del(`apikey:${oldKey}`)
    }
  }

  // Set mappings for all active API keys
  if (merchant.apiKeys?.length > 0) {
    for (const k of merchant.apiKeys) {
      if (k.active) {
        tx.set(`apikey:${k.key}`, merchant.id)
      } else {
        tx.del(`apikey:${k.key}`)
      }
    }
  } else {
    // Backward compat: single apiKey
    tx.set(`apikey:${merchant.apiKey}`, merchant.id)
  }

  await tx.exec()
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
  // Completed payments persist indefinitely so merchants keep their history;
  // pending/expired get 24h TTL to keep the live working set bounded.
  if (payment.status === 'completed') {
    await r.set(`payment:${payment.id}`, payment)
  } else {
    await r.set(`payment:${payment.id}`, payment, { ex: 86400 })
  }
  await r.zadd(`merchant_payments:${payment.merchantId}`, {
    score: new Date(payment.createdAt).getTime(),
    member: payment.id,
  })
}

export async function getPaymentsByMerchant(merchantId: string, limit = 100): Promise<ServerPayment[]> {
  const r = getRedis()
  const zkey = `merchant_payments:${merchantId}`
  const live: ServerPayment[] = []
  const orphans: string[] = []
  const batchSize = Math.max(limit, 50)
  let start = 0

  // The index can hold members whose payment value has expired (pending/expired
  // payments carry a 24h TTL; completed ones never expire). A naive top-N read
  // would surface those as nulls and silently truncate real history, so we walk
  // the index in windows, accumulating live payments until we have `limit` of
  // them (or run out), and collect the dead members to prune below.
  while (live.length < limit) {
    const ids = await r.zrange<string[]>(zkey, start, start + batchSize - 1, { rev: true })
    if (!ids.length) break
    const keys = ids.map(id => `payment:${id}`)
    const payments = await r.mget<(ServerPayment | null)[]>(...keys)
    for (let i = 0; i < payments.length; i++) {
      const p = payments[i]
      if (p !== null) {
        if (live.length < limit) live.push(p)
      } else {
        orphans.push(ids[i])
      }
    }
    if (ids.length < batchSize) break // index exhausted
    start += batchSize
  }

  // Lazy-heal: drop members whose value key is gone. A null mget result proves
  // the key expired (completed payments never expire), so this can't remove a
  // live payment. Keeps the index bounded over time.
  if (orphans.length) {
    await r.zrem(zkey, ...orphans)
  }

  return live
}

// Settlement lock: ensures only one concurrent request performs the
// pending -> completed/expired transition and its side-effects (Shopify
// settle, merchant webhook). Returns true if this caller acquired the lock.
export async function acquireSettleLock(paymentId: string, ttlSeconds = 30): Promise<boolean> {
  const r = getRedis()
  const res = await r.set(`settle:${paymentId}`, '1', { nx: true, ex: ttlSeconds })
  return res === 'OK'
}
