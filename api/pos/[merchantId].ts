import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getMerchantById, savePaymentToKv } from '../_lib/redis.js'
import { sendWebhook } from '../_lib/webhook.js'
import { fetchLnurlPayInfo, requestInvoice, satsToMsats } from '../../src/lib/lnurl.js'

const PAYMENT_EXPIRY_SECS = 600

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method === 'GET') {
    return handleGet(req, res)
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  return handlePost(req, res)
}

// GET /api/pos/:merchantId — check POS status and get merchant info
async function handleGet(req: VercelRequest, res: VercelResponse) {
  const merchantId = req.query.merchantId as string
  const merchant = await getMerchantById(merchantId)

  if (!merchant) {
    return res.status(404).json({ success: false, error: 'Merchant not found' })
  }

  if (!merchant.posEnabled) {
    return res.status(403).json({ success: false, error: 'POS is not enabled for this merchant' })
  }

  return res.status(200).json({
    success: true,
    data: {
      storeName: merchant.storeName,
      brandColor: merchant.brandColor,
      brandBackground: merchant.brandBackground,
      logoUrl: merchant.logoUrl,
    },
  })
}

// POST /api/pos/:merchantId — create a POS charge (no auth required)
async function handlePost(req: VercelRequest, res: VercelResponse) {
  const merchantId = req.query.merchantId as string
  const merchant = await getMerchantById(merchantId)

  if (!merchant) {
    return res.status(404).json({ success: false, error: 'Merchant not found' })
  }

  if (!merchant.posEnabled) {
    return res.status(403).json({ success: false, error: 'POS is not enabled for this merchant' })
  }

  const { amountSats, description, items } = req.body ?? {}
  if (!amountSats || typeof amountSats !== 'number' || amountSats < 1) {
    return res.status(400).json({ success: false, error: 'amountSats must be a positive integer' })
  }

  const address = merchant.lightningAddress
  if (!address) {
    return res.status(400).json({ success: false, error: 'Merchant has no Lightning address configured' })
  }

  try {
    const lnurlInfo = await fetchLnurlPayInfo(address)
    const msats = satsToMsats(amountSats)

    if (msats < lnurlInfo.minSendable || msats > lnurlInfo.maxSendable) {
      return res.status(400).json({
        success: false,
        error: `Amount must be between ${Math.ceil(lnurlInfo.minSendable / 1000)} and ${Math.floor(lnurlInfo.maxSendable / 1000)} sats`,
      })
    }

    const invoiceResponse = await requestInvoice(lnurlInfo.callback, msats, description, PAYMENT_EXPIRY_SECS)
    const verifyUrl = invoiceResponse.verify || null
    const paymentId = `${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`
    const now = new Date()

    const payment = {
      id: paymentId,
      merchantId: merchant.id,
      amountMsats: msats,
      amountSats,
      description: description || null,
      invoice: invoiceResponse.pr,
      verifyUrl,
      status: 'pending' as const,
      metadata: { source: 'pos', items: items || null },
      createdAt: now.toISOString(),
      paidAt: null,
      expiresAt: new Date(now.getTime() + PAYMENT_EXPIRY_SECS * 1000).toISOString(),
    }

    await savePaymentToKv(payment)

    if (merchant.webhookUrl && merchant.webhookSecret) {
      sendWebhook(merchant.webhookUrl, merchant.webhookSecret, 'payment.created', {
        paymentId, amountSats, description: description || null, status: 'pending',
      }).catch(() => {})
    }

    return res.status(201).json({
      success: true,
      data: {
        paymentId,
        invoice: invoiceResponse.pr,
        expiresAt: payment.expiresAt,
        verifyUrl,
        amountSats,
      },
    })
  } catch (err) {
    console.error('POS charge error:', err)
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to create charge',
    })
  }
}
