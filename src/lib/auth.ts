/**
 * Derives a deterministic merchant ID and auth token from a BIP-39 mnemonic.
 *
 * - merchantId: HMAC-SHA256(mnemonic, "glow-pay:merchant-id"), hex, first 16 chars → "m_<hex>"
 * - authToken: HMAC-SHA256(mnemonic, "glow-pay:auth-token"), full hex (64 chars)
 *
 * The mnemonic never leaves the client. The server only sees the authToken
 * (via Bearer header) and stores its SHA-256 hash for verification.
 */

async function hmacSha256(key: string, data: string): Promise<string> {
  const enc = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data))
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function deriveMerchantId(mnemonic: string): Promise<string> {
  const hash = await hmacSha256(mnemonic, 'glow-pay:merchant-id')
  return `m_${hash.slice(0, 16)}`
}

export async function deriveAuthToken(mnemonic: string): Promise<string> {
  return hmacSha256(mnemonic, 'glow-pay:auth-token')
}
