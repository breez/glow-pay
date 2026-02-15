// Server-side address rotation — mirrors walletService.selectAddress logic
// Weighted-random favoring least-recently-used

export function selectRotationAddress(
  addresses: string[],
  usage: Record<number, number>,
  _rotationEnabled: boolean = true,
  rotationCount?: number
): { address: string; accountIndex: number } {
  if (addresses.length === 0) throw new Error('No addresses available')

  // Use first `rotationCount` addresses, or all if not specified
  let candidates = addresses
    .map((addr, i) => ({ address: addr, accountIndex: i }))
    .filter(a => a.address)

  if (rotationCount !== undefined && rotationCount > 0) {
    candidates = candidates.filter(a => a.accountIndex < rotationCount)
  }

  if (candidates.length === 0) {
    return { address: addresses[0], accountIndex: 0 }
  }

  // Single address — return directly
  if (candidates.length === 1) {
    return candidates[0]
  }

  // Sort by last used (ascending — least recent first)
  const sorted = [...candidates].sort((a, b) => {
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
