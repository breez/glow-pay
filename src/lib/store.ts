import type { Merchant, Payment } from './types'

// Simple in-memory store for demo purposes
// In production, this would be API calls to your backend

const STORAGE_KEY_MERCHANT = 'glow_pay_merchant'
const STORAGE_KEY_PAYMENTS = 'glow_pay_payments'

// Migrate old merchant records
export function migrateMerchant(merchant: Merchant): Merchant {
  // Migrate single apiKey to apiKeys array
  if (!merchant.apiKeys) {
    merchant.apiKeys = [{
      key: merchant.apiKey,
      label: 'Default',
      createdAt: merchant.createdAt,
      active: true,
    }]
  }
  if (merchant.webhookUrl === undefined) {
    merchant.webhookUrl = null
  }
  if (merchant.webhookSecret === undefined) {
    merchant.webhookSecret = null
  }
  if (merchant.brandColor === undefined) {
    merchant.brandColor = null
  }
  if (merchant.brandBackground === undefined) {
    merchant.brandBackground = null
  }
  if (merchant.logoUrl === undefined) {
    merchant.logoUrl = null
  }
  // Migrate from multi-address: use first address if lightningAddresses exists
  const legacy = merchant as Merchant & { lightningAddresses?: string[] }
  if (legacy.lightningAddresses?.length && !merchant.lightningAddress) {
    merchant.lightningAddress = legacy.lightningAddresses[0]
  }
  // Keep apiKey in sync with first active key
  const firstActive = merchant.apiKeys.find(k => k.active)
  if (firstActive) {
    merchant.apiKey = firstActive.key
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
    const payments: Payment[] = JSON.parse(stored)
    // Sort newest first by createdAt
    payments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    return payments
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
