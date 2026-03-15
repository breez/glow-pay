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
  lightningAddress: string
  redirectUrl: string | null
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
    lightningAddress: string
    lightningAddresses?: string[]
    redirectUrl: string | null
    apiKey: string
    apiKeys: Array<{ key: string; label: string; active: boolean; createdAt?: string }>
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

export async function listPaymentsFromApi(apiKey: string): Promise<{
  success: boolean
  data?: Array<{
    id: string
    amountSats: number
    description: string | null
    status: 'pending' | 'completed' | 'expired'
    type?: 'incoming' | 'sweep'
    metadata: Record<string, unknown> | null
    createdAt: string
    expiresAt: string
    paidAt: string | null
  }>
  error?: string
}> {
  const res = await fetch(`${API_BASE}/payments`, {
    headers: { 'X-API-Key': apiKey },
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
    type?: 'incoming' | 'sweep'
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

export async function recordSweepViaApi(
  apiKey: string,
  amountSats: number,
  description?: string,
): Promise<{ success: boolean; data?: { paymentId: string }; error?: string }> {
  const res = await fetch(`${API_BASE}/payments/sweep`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify({ amountSats, description }),
  })
  return res.json()
}

export async function updatePaymentStatusViaApi(
  apiKey: string,
  paymentId: string,
  status: 'completed' | 'expired',
): Promise<{ success: boolean; error?: string }> {
  const res = await fetch(`${API_BASE}/payments/${paymentId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify({ status }),
  })
  return res.json()
}
