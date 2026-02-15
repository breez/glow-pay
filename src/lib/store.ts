import type { Merchant, Payment } from './types'

// Simple in-memory store for demo purposes
// In production, this would be API calls to your backend

const STORAGE_KEY_MERCHANT = 'glow_pay_merchant'
const STORAGE_KEY_PAYMENTS = 'glow_pay_payments'
const STORAGE_KEY_ADDRESS_USAGE = 'glow_pay_address_usage'

// Address usage tracking for rotation
export function getAddressUsage(): Record<number, number> {
  const stored = localStorage.getItem(STORAGE_KEY_ADDRESS_USAGE)
  if (!stored) return {}
  try {
    return JSON.parse(stored)
  } catch {
    return {}
  }
}

export function updateAddressUsage(accountIndex: number): void {
  const usage = getAddressUsage()
  usage[accountIndex] = Date.now()
  localStorage.setItem(STORAGE_KEY_ADDRESS_USAGE, JSON.stringify(usage))
}

// Migrate old merchant records that lack lightningAddresses
export function migrateMerchant(merchant: Merchant): Merchant {
  if (!merchant.lightningAddresses) {
    merchant.lightningAddresses = [merchant.lightningAddress]
  }
  return merchant
}

// Merchant storage
export function getMerchant(): Merchant | null {
  const stored = localStorage.getItem(STORAGE_KEY_MERCHANT)
  if (!stored) return null
  try {
    return migrateMerchant(JSON.parse(stored))
  } catch {
    return null
  }
}

export function saveMerchant(merchant: Merchant): void {
  localStorage.setItem(STORAGE_KEY_MERCHANT, JSON.stringify(merchant))
}

export function clearMerchant(): void {
  localStorage.removeItem(STORAGE_KEY_MERCHANT)
}

// Payments storage
export function getPayments(): Payment[] {
  const stored = localStorage.getItem(STORAGE_KEY_PAYMENTS)
  if (!stored) return []
  try {
    return JSON.parse(stored)
  } catch {
    return []
  }
}

export function savePayment(payment: Payment): void {
  const payments = getPayments()
  const existingIndex = payments.findIndex(p => p.id === payment.id)
  if (existingIndex >= 0) {
    payments[existingIndex] = payment
  } else {
    payments.unshift(payment)
  }
  localStorage.setItem(STORAGE_KEY_PAYMENTS, JSON.stringify(payments))
}

export function getPayment(id: string): Payment | null {
  const payments = getPayments()
  return payments.find(p => p.id === id) || null
}

export function updatePaymentStatus(id: string, status: Payment['status'], paidAt?: string): void {
  const payments = getPayments()
  const payment = payments.find(p => p.id === id)
  if (payment) {
    payment.status = status
    if (paidAt) {
      payment.paidAt = paidAt
    }
    localStorage.setItem(STORAGE_KEY_PAYMENTS, JSON.stringify(payments))
  }
}

// Generate IDs
export function generateId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`
}

// Generate API key
export function generateApiKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = 'glow_'
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

// Generate secret for signing redirects
export function generateSecret(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < 48; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}
