#!/usr/bin/env node
// One-shot migration: PERSIST all `payment:*` Redis keys whose status is
// "completed" so they no longer expire on TTL.
//
// Usage:
//   node scripts/persist-completed-payments.mjs --dry   # scan only, no writes
//   node scripts/persist-completed-payments.mjs         # apply

import { Redis } from '@upstash/redis'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envFile = resolve(__dirname, '..', '.env.production')

let url, token
try {
  const env = readFileSync(envFile, 'utf8')
  for (const line of env.split('\n')) {
    const [k, ...rest] = line.split('=')
    const v = rest.join('=').replace(/^"|"$/g, '')
    if (k === 'KV_REST_API_URL') url = v
    if (k === 'KV_REST_API_TOKEN') token = v
  }
} catch (err) {
  console.error(`Could not read ${envFile}:`, err.message)
  process.exit(1)
}

if (!url || !token) {
  console.error('Missing KV_REST_API_URL or KV_REST_API_TOKEN in .env.production')
  process.exit(1)
}

const dry = process.argv.includes('--dry')
const redis = new Redis({ url, token })

console.log(dry ? '[DRY RUN] Scanning…' : '[APPLY] Scanning…')

let cursor = 0
let scanned = 0
let completed = 0
let persisted = 0
let alreadyPersistent = 0
let nullValues = 0

do {
  const [nextCursor, keys] = await redis.scan(cursor, { match: 'payment:*', count: 200 })
  cursor = Number(nextCursor)

  if (keys.length === 0) continue

  const values = await redis.mget(...keys)

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    const val = values[i]
    scanned++
    if (!val) {
      nullValues++
      continue
    }
    if (val.status !== 'completed') continue
    completed++

    const ttl = await redis.ttl(key)
    if (ttl === -1) {
      alreadyPersistent++
      continue
    }
    if (!dry) {
      await redis.persist(key)
    }
    persisted++
  }
} while (cursor !== 0)

console.log({
  scanned,
  completed,
  persisted,
  alreadyPersistent,
  nullValues,
  dryRun: dry,
})
