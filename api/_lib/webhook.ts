import { createHmac } from 'crypto'

export async function sendWebhook(
  url: string,
  secret: string,
  event: string,
  payload: Record<string, unknown>
): Promise<void> {
  const body = JSON.stringify({ event, ...payload, timestamp: new Date().toISOString() })
  const signature = createHmac('sha256', secret).update(body).digest('hex')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Glow-Signature': signature,
      },
      body,
      signal: controller.signal,
    })
  } catch {
    // Best-effort delivery — silently fail
  } finally {
    clearTimeout(timeout)
  }
}
