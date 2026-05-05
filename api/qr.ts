import type { VercelRequest, VercelResponse } from '@vercel/node'
import QRCode from 'qrcode'

/**
 * Returns a QR code SVG for arbitrary text. Used by the Shopify checkout
 * UI extension (can't run a JS QR lib — must reference an image source).
 *
 *   /api/qr?data=lnbc1...&size=320
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const data = typeof req.query.data === 'string' ? req.query.data : null
  if (!data) return res.status(400).json({ error: 'Missing `data` query param' })
  if (data.length > 4000) return res.status(413).json({ error: 'data too long' })

  const sizeRaw = typeof req.query.size === 'string' ? parseInt(req.query.size, 10) : 320
  const size = Number.isFinite(sizeRaw) ? Math.min(Math.max(sizeRaw, 64), 1024) : 320

  try {
    const svg = await QRCode.toString(data, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 1,
      width: size,
      color: { dark: '#000000', light: '#ffffff' },
    })
    res.setHeader('Content-Type', 'image/svg+xml')
    res.setHeader('Cache-Control', 'public, max-age=600, immutable')
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    return res.status(200).send(svg)
  } catch (err) {
    console.error('QR generation failed:', err)
    return res.status(500).json({ error: 'Failed to generate QR' })
  }
}
