import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getMerchantByApiKey, getAddressUsageFromKv, updateAddressUsageInKv, savePaymentToKv } from '../_lib/redis.js'
import { selectRotationAddress } from '../_lib/rotation.js'
import { sendWebhook } from '../_lib/webhook.js'
import { fetchLnurlPayInfo, requestInvoice, satsToMsats, extractPaymentHash, buildVerifyUrl } from '../../src/lib/lnurl.js'

const PAYMENT_EXPIRY_SECS = 600

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Authenticate
  const apiKey = req.headers['x-api-key'] as string
  if (!apiKey) {
    return res.status(401).json({ error: 'Missing X-API-Key header' })
  }

  const merchant = await getMerchantByApiKey(apiKey)
  if (!merchant) {
    return res.status(401).json({ error: 'Invalid API key' })
  }

  // Validate body
  const { amountSats, description, metadata } = req.body ?? {}
  if (!amountSats || typeof amountSats !== 'number' || amountSats < 1) {
    return res.status(400).json({ error: 'amountSats must be a positive integer' })
  }

  // Select rotation address
  const usage = await getAddressUsageFromKv(merchant.id)
  const selected = selectRotationAddress(merchant.lightningAddresses, usage, merchant.rotationEnabled ?? true, merchant.rotationCount)
  await updateAddressUsageInKv(merchant.id, selected.accountIndex)

  try {
    // Fetch LNURL-pay info from breez.cash
    const lnurlInfo = await fetchLnurlPayInfo(selected.address)
    const msats = satsToMsats(amountSats)

    if (msats < lnurlInfo.minSendable || msats > lnurlInfo.maxSendable) {
      return res.status(400).json({
        error: `Amount must be between ${Math.ceil(lnurlInfo.minSendable / 1000)} and ${Math.floor(lnurlInfo.maxSendable / 1000)} sats`,
      })
    }

    // Request invoice from breez.cash
    const invoiceResponse = await requestInvoice(lnurlInfo.callback, msats, description, PAYMENT_EXPIRY_SECS)

    // Build verify URL
    let verifyUrl = invoiceResponse.verify || null
    if (!verifyUrl) {
      const paymentHash = extractPaymentHash(invoiceResponse.pr)
      if (paymentHash) {
        verifyUrl = buildVerifyUrl(selected.address, paymentHash)
      }
    }

    // Generate payment ID
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
      metadata: metadata || null,
      createdAt: now.toISOString(),
      paidAt: null,
      expiresAt: new Date(now.getTime() + PAYMENT_EXPIRY_SECS * 1000).toISOString(),
      accountIndex: selected.accountIndex,
      usedAddress: selected.address,
    }

    await savePaymentToKv(payment)

    // Fire webhook (best-effort)
    if (merchant.webhookUrl && merchant.webhookSecret) {
      sendWebhook(merchant.webhookUrl, merchant.webhookSecret, 'payment.created', {
        paymentId, amountSats, description: description || null, status: 'pending',
      }).catch(() => {})
    }

    const baseUrl = `https://${req.headers.host}`
    return res.status(201).json({
      success: true,
      data: {
        paymentId,
        paymentUrl: `${baseUrl}/pay/${merchant.id}/${paymentId}`,
        invoice: invoiceResponse.pr,
        expiresAt: payment.expiresAt,
        verifyUrl,
        amountSats,
      },
    })
  } catch (err) {
    console.error('Payment creation error:', err)
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to create payment',
    })
  }
}
