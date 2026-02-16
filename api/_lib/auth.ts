import { createHmac, createHash } from 'crypto'

/**
 * Server-side auth utilities — mirrors the client derivation.
 *
 * We hash the auth token before storing it so that even if Redis is
 * compromised, the attacker can't impersonate the merchant.
 */

export function hashAuthToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * Derive merchant ID from mnemonic (used in GET restore endpoint
 * for backwards-compat verification — NOT normally called server-side).
 */
export function deriveMerchantIdServer(mnemonic: string): string {
  const hash = createHmac('sha256', mnemonic)
    .update('glow-pay:merchant-id')
    .digest('hex')
  return `m_${hash.slice(0, 16)}`
}
