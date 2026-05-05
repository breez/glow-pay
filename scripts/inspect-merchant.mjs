#!/usr/bin/env node
// Inspect a merchant by API key — show merchant ID, payment index size,
// and any orphaned/expired payment IDs.

import { Redis } from '@upstash/redis'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const env = readFileSync(resolve(__dirname, '..', '.env.production'), 'utf8')
let url, token
for (const line of env.split('\n')) {
  const [k, ...rest] = line.split('=')
  const v = rest.join('=').replace(/^"|"$/g, '')
  if (k === 'KV_REST_API_URL') url = v
  if (k === 'KV_REST_API_TOKEN') token = v
}
const redis = new Redis({ url, token })

const apiKey = process.argv[2]
if (!apiKey) {
  console.error('Usage: node inspect-merchant.mjs <api-key>')
  process.exit(1)
}

const merchantId = await redis.get(`apikey:${apiKey}`)
console.log('apikey →', merchantId)
if (!merchantId) process.exit(0)

const merchant = await redis.get(`merchant:${merchantId}`)
console.log('merchant.storeName:', merchant?.storeName)
console.log('merchant.lightningAddress:', merchant?.lightningAddress)
console.log('merchant.apiKeys count:', merchant?.apiKeys?.length)

const ids = await redis.zrange(`merchant_payments:${merchantId}`, 0, -1, { rev: true })
console.log(`merchant_payments:${merchantId} contains ${ids.length} ids`)

if (ids.length === 0) process.exit(0)

const keys = ids.map(id => `payment:${id}`)
const vals = await redis.mget(...keys)
const present = vals.filter(v => v !== null).length
const missing = vals.length - present
const completed = vals.filter(v => v?.status === 'completed').length
console.log({ indexed: ids.length, presentInRedis: present, expired: missing, completed })

if (vals[0]) {
  console.log('newest:', { id: vals[0].id, status: vals[0].status, createdAt: vals[0].createdAt, amountSats: vals[0].amountSats })
}
