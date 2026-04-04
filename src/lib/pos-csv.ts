import type { POSItem } from './pos-store'
import { createPOSItem } from './pos-store'

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function exportItemsToCSV(items: POSItem[]): string {
  const header = 'name,price_sats,emoji,sku,price_usd'
  const rows = items.map(item =>
    `${escapeCSV(item.name)},${item.priceSats},${escapeCSV(item.emoji || '')},${escapeCSV(item.sku || '')},${item.priceUsd || ''}`
  )
  return [header, ...rows].join('\n')
}

export function downloadCSV(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export interface CSVParseResult {
  items: POSItem[]
  skipped: number
}

export function parseCSVToItems(csv: string): CSVParseResult {
  const lines = csv.trim().split('\n')
  if (lines.length < 2) return { items: [], skipped: 0 }

  // Skip header
  const dataLines = lines.slice(1)
  const items: POSItem[] = []
  let skipped = 0

  for (const line of dataLines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Simple CSV parse (handles quoted fields)
    const fields = parseCSVLine(trimmed)
    const name = fields[0]?.trim()
    const priceSats = parseInt(fields[1]?.trim(), 10)
    const emoji = fields[2]?.trim() || '📦'
    const sku = fields[3]?.trim() || undefined
    const priceUsd = fields[4]?.trim() ? parseFloat(fields[4].trim()) : undefined

    if (!name || isNaN(priceSats) || priceSats < 1) {
      skipped++
      continue
    }

    items.push(createPOSItem(name, priceSats, emoji, priceUsd, sku))
  }

  return { items, skipped }
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        fields.push(current)
        current = ''
      } else {
        current += ch
      }
    }
  }
  fields.push(current)
  return fields
}
