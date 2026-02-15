// Server-side address rotation — mirrors walletService.selectAddress logic
// Weighted-random favoring least-recently-used, excludes primary (index 0)

export function selectRotationAddress(
  addresses: string[],
  usage: Record<number, number>,
  rotationEnabled: boolean = true
): { address: string; accountIndex: number } {
  // If only one address or rotation disabled, use primary
  if (addresses.length <= 1 || !rotationEnabled) {
    if (addresses.length === 0) throw new Error('No addresses available')
    return { address: addresses[0], accountIndex: 0 }
  }

  // Rotation addresses are indices 1+ (skip primary at index 0)
  const rotationAddrs = addresses
    .map((addr, i) => ({ address: addr, accountIndex: i }))
    .filter(a => a.accountIndex !== 0 && a.address)

  // If no rotation addresses exist, fall back to primary
  if (rotationAddrs.length === 0) {
    return { address: addresses[0], accountIndex: 0 }
  }

  // Sort by last used (ascending — least recent first)
  const sorted = [...rotationAddrs].sort((a, b) => {
    const aUsage = usage[a.accountIndex] ?? 0
    const bUsage = usage[b.accountIndex] ?? 0
    return aUsage - bUsage
  })

  // Assign weights: first in sorted order (least recent) gets highest weight
  const weights = sorted.map((_, i) => sorted.length - i)
  const totalWeight = weights.reduce((sum, w) => sum + w, 0)

  let random = Math.random() * totalWeight
  for (let i = 0; i < sorted.length; i++) {
    random -= weights[i]
    if (random <= 0) {
      return sorted[i]
    }
  }

  return sorted[0]
}
