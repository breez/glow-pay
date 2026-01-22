// Merchant types
export interface Merchant {
  id: string
  lightningAddress: string
  storeName: string
  redirectUrl: string | null
  redirectSecret: string
  apiKey: string
  createdAt: string
}

// Payment types
export interface Payment {
  id: string
  merchantId: string
  amountMsats: number
  amountSats: number
  description: string | null
  invoice: string | null
  verifyUrl: string | null
  status: 'pending' | 'completed' | 'expired'
  metadata: Record<string, unknown> | null
  createdAt: string
  paidAt: string | null
  expiresAt: string
}

// LNURL types
export interface LnurlPayResponse {
  callback: string
  minSendable: number
  maxSendable: number
  metadata: string
  tag: 'payRequest'
  commentAllowed?: number
}

export interface LnurlInvoiceResponse {
  pr: string  // bolt11 invoice
  routes: unknown[]
  successAction?: LnurlSuccessAction
  verify?: string  // LNURL-verify URL
}

export interface LnurlSuccessAction {
  tag: 'url' | 'message' | 'aes'
  description?: string
  url?: string
  message?: string
}

export interface LnurlVerifyResponse {
  status: 'OK' | 'ERROR'
  settled: boolean
  preimage: string | null
  pr: string
}

// API response types
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

export interface CreatePaymentRequest {
  amountSats: number
  description?: string
  metadata?: Record<string, unknown>
}

export interface CreatePaymentResponse {
  paymentId: string
  paymentUrl: string
  invoice: string
  expiresAt: string
}
