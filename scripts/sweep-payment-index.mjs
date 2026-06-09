#!/usr/bin/env node
// One-shot cleanup: PRUNE orphaned members from every `merchant_payments:*`
// sorted set. A member is orphaned when its `payment:<id>` value no longer
// exists (pending/expired payments carry a 24h TTL; completed ones never
// expire). The live read path (getPaymentsByMerchant) heals these lazily, but
// only for members it pages through — this sweeps the entire backlog in one pass.
//
// Provably safe: a null mget result proves the payment key is gone, so we only
// ever zrem dead members. Payment values themselves are never touched.
//
// Usage:
//   node scripts/sweep-payment-index.mjs --dry   # scan only, no writes
//   node scripts/sweep-payment-index.mjs         # apply

import { Redis } from '@upstash/redis'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const candidates = ['.env.production', '.env.local'].map(f => resolve(__dirname, '..', f))

let url, token, loadedFrom
for (const envFile of candidates) {
  let env
  try {
    env = readFileSync(envFile, 'utf8')
  } catch {
    continue
  }
  for (const line of env.split('\n')) {
    const [k, ...rest] = line.split('=')
    const v = rest.join('=').replace(/^"|"$/g, '')
    if (k === 'KV_REST_API_URL') url = v
    if (k === 'KV_REST_API_TOKEN') token = v
  }
  if (url && token) {
    loadedFrom = envFile
    break
  }
}

if (!loadedFrom) {
  console.error(`Could not find KV creds in any of: ${candidates.join(', ')}`)
  process.exit(1)
}
console.log(`Using KV creds from ${loadedFrom}`)

if (!url || !token) {
  console.error('Missing KV_REST_API_URL or KV_REST_API_TOKEN in .env.production')
  process.exit(1)
}

const dry = process.argv.includes('--dry')
const redis = new Redis({ url, token })

console.log(dry ? '[DRY RUN] Scanning…' : '[APPLY] Scanning…')

const MGET_CHUNK = 200

let cursor = 0
let zsets = 0
let totalMembers = 0
let orphansFound = 0
let orphansRemoved = 0

do {
  const [nextCursor, keys] = await redis.scan(cursor, { match: 'merchant_payments:*', count: 200 })
  cursor = Number(nextCursor)

  for (const zkey of keys) {
    zsets++
    const members = await redis.zrange(zkey, 0, -1) // all member IDs
    if (!members.length) continue
    totalMembers += members.length

    const orphans = []
    for (let i = 0; i < members.length; i += MGET_CHUNK) {
      const batch = members.slice(i, i + MGET_CHUNK)
      const values = await redis.mget(...batch.map(id => `payment:${id}`))
      for (let j = 0; j < batch.length; j++) {
        if (values[j] === null) orphans.push(batch[j])
      }
    }

    if (!orphans.length) continue
    orphansFound += orphans.length

    if (!dry) {
      // zrem in chunks too, in case a zset has a huge orphan count
      for (let i = 0; i < orphans.length; i += MGET_CHUNK) {
        const batch = orphans.slice(i, i + MGET_CHUNK)
        await redis.zrem(zkey, ...batch)
        orphansRemoved += batch.length
      }
    }

    console.log(`${zkey}: ${members.length} members, ${orphans.length} orphaned${dry ? ' (would remove)' : ' (removed)'}`)
  }
} while (cursor !== 0)

console.log({
  zsets,
  totalMembers,
  orphansFound,
  orphansRemoved,
  dryRun: dry,
})
