import { deriveAuthToken } from './auth'
import { getSavedMnemonic } from './wallet/walletService'

const API_BASE = '/api'

/** Get the auth token derived from the saved mnemonic, or null if not available. */
async function getAuthToken(): Promise<string | null> {
  const mnemonic = getSavedMnemonic()
  if (!mnemonic) return null
  return deriveAuthToken(mnemonic)
}

export async function syncMerchantToServer(merchant: {
  merchantId: string
  apiKey: string
  apiKeys?: Array<{ key: string; label: string; active: boolean }>
  storeName: string
  lightningAddresses: string[]
  redirectUrl: string | null
  rotationEnabled?: boolean
  rotationCount?: number
  webhookUrl?: string | null
  webhookSecret?: string | null
  brandColor?: string | null
  brandBackground?: string | null
  logoUrl?: string | null
}): Promise<{ success: boolean }> {
  const authToken = await getAuthToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`
  }

  const res = await fetch(`${API_BASE}/merchants`, {
    method: 'POST',
    headers,
    body: JSON.stringify(merchant),
  })
  return res.json()
}

/** Restore merchant config from server using mnemonic-derived auth. */
export async function restoreMerchantFromServer(merchantId: string, authToken: string): Promise<{
  success: boolean
  data?: {
    id: string
    storeName: string
    lightningAddresses: string[]
    redirectUrl: string | null
    apiKey: string
    apiKeys: Array<{ key: string; label: string; active: boolean; createdAt?: string }>
    rotationEnabled: boolean
    rotationCount: number
    webhookUrl?: string | null
    webhookSecret?: string | null
    brandColor?: string | null
    brandBackground?: string | null
    logoUrl?: string | null
    registeredAt: string
  }
  error?: string
}> {
  const res = await fetch(`${API_BASE}/merchants?id=${encodeURIComponent(merchantId)}`, {
    headers: { 'Authorization': `Bearer ${authToken}` },
  })
  return res.json()
}

export async function createPaymentViaApi(
  apiKey: string,
  amountSats: number,
  description?: string,
  metadata?: Record<string, unknown>
): Promise<{
  success: boolean
  data?: {
    paymentId: string
    paymentUrl: string
    invoice: string
    expiresAt: string
    verifyUrl: string | null
    amountSats: number
  }
  error?: string
}> {
  const res = await fetch(`${API_BASE}/payments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify({ amountSats, description, metadata }),
  })
  return res.json()
}

export async function getPaymentFromApi(paymentId: string): Promise<{
  success: boolean
  data?: {
    id: string
    amountSats: number
    description: string | null
    invoice: string | null
    status: 'pending' | 'completed' | 'expired'
    createdAt: string
    expiresAt: string
    paidAt: string | null
    verifyUrl: string | null
    merchant: {
      storeName: string
      redirectUrl: string | null
      brandColor?: string | null
      brandBackground?: string | null
      logoUrl?: string | null
    } | null
  }
  error?: string
}> {
  const res = await fetch(`${API_BASE}/payments/${paymentId}`)
  return res.json()
}
