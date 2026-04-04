import { generateId } from './store'

export interface POSItem {
  id: string
  name: string
  priceSats: number
  priceUsd?: number
  emoji: string
  createdAt: string
  updatedAt: string
}

export interface CartItem {
  item: POSItem
  quantity: number
}

export interface POSSettings {
  currency: 'SAT' | 'USD'
  lastTab: 'keypad' | 'items'
}

const ITEMS_KEY = 'glow_pos_items'
const SETTINGS_KEY = 'glow_pos_settings'

// Items CRUD

export function getPOSItems(): POSItem[] {
  const stored = localStorage.getItem(ITEMS_KEY)
  if (!stored) return []
  try {
    return JSON.parse(stored)
  } catch {
    return []
  }
}

export function savePOSItem(item: POSItem): void {
  const items = getPOSItems()
  const idx = items.findIndex(i => i.id === item.id)
  if (idx >= 0) {
    items[idx] = item
  } else {
    items.push(item)
  }
  localStorage.setItem(ITEMS_KEY, JSON.stringify(items))
}

export function deletePOSItem(id: string): void {
  const items = getPOSItems().filter(i => i.id !== id)
  localStorage.setItem(ITEMS_KEY, JSON.stringify(items))
}

export function setPOSItems(items: POSItem[]): void {
  localStorage.setItem(ITEMS_KEY, JSON.stringify(items))
}

export function createPOSItem(name: string, priceSats: number, emoji: string, priceUsd?: number): POSItem {
  const now = new Date().toISOString()
  return {
    id: generateId(),
    name,
    priceSats,
    priceUsd,
    emoji,
    createdAt: now,
    updatedAt: now,
  }
}

// Settings

export function getPOSSettings(): POSSettings {
  const stored = localStorage.getItem(SETTINGS_KEY)
  if (!stored) return { currency: 'SAT', lastTab: 'keypad' }
  try {
    return JSON.parse(stored)
  } catch {
    return { currency: 'SAT', lastTab: 'keypad' }
  }
}

export function savePOSSettings(settings: POSSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}
