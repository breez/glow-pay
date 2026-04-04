import { useState, useEffect, useCallback } from 'react'

interface ExchangeRateResult {
  rate: number | null
  loading: boolean
  error: string | null
  refresh: () => void
}

// Module-level cache shared across hook instances
let cachedRate: number | null = null
let cachedAt = 0
let fetchPromise: Promise<number> | null = null
const CACHE_MS = 3 * 60 * 1000 // 3 minutes

async function fetchRate(): Promise<number> {
  const now = Date.now()
  if (cachedRate !== null && now - cachedAt < CACHE_MS) {
    return cachedRate
  }
  // Deduplicate concurrent fetches
  if (fetchPromise) return fetchPromise
  fetchPromise = (async () => {
    try {
      const res = await fetch('https://api.yadio.io/rate/USD')
      if (!res.ok) throw new Error(`Yadio API ${res.status}`)
      const data = await res.json()
      cachedRate = data.rate as number
      cachedAt = Date.now()
      return cachedRate
    } finally {
      fetchPromise = null
    }
  })()
  return fetchPromise
}

export function useExchangeRate(): ExchangeRateResult {
  const [rate, setRate] = useState<number | null>(cachedRate)
  const [loading, setLoading] = useState(cachedRate === null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    cachedAt = 0 // force re-fetch
    setLoading(true)
    setError(null)
    fetchRate()
      .then(r => { setRate(r); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  useEffect(() => {
    let mounted = true
    fetchRate()
      .then(r => { if (mounted) { setRate(r); setLoading(false) } })
      .catch(e => { if (mounted) { setError(e.message); setLoading(false) } })

    const interval = setInterval(() => {
      fetchRate()
        .then(r => { if (mounted) setRate(r) })
        .catch(() => {})
    }, CACHE_MS)

    return () => { mounted = false; clearInterval(interval) }
  }, [])

  return { rate, loading, error, refresh }
}

// Conversion helpers

export function satsToUsd(sats: number, rate: number): number {
  return (sats / 100_000_000) * rate
}

export function usdToSats(usd: number, rate: number): number {
  return Math.round((usd / rate) * 100_000_000)
}

export function formatUsd(usd: number): string {
  return usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
