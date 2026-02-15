const API_BASE = '/api'

export async function syncMerchantToServer(merchant: {
  merchantId: string
  apiKey: string
  apiKeys?: Array<{ key: string; label: string; active: boolean }>
  storeName: string
  lightningAddresses: string[]
  redirectUrl: string | null
  rotationEnabled?: boolean
  rotationCount?: number
}): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/merchants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(merchant),
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
    } | null
  }
  error?: string
}> {
  const res = await fetch(`${API_BASE}/payments/${paymentId}`)
  return res.json()
}
