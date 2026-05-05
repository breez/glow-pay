import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getMerchantByApiKey } from '../_lib/redis.js'
import {
  consumeState,
  exchangeCodeForToken,
  getInstallation,
  isValidShopDomain,
  registerUninstallWebhook,
  saveInstallation,
  verifyOAuthHmac,
} from '../_lib/shopify.js'

/**
 * GET — Shopify redirects here after the merchant approves the OAuth
 * scopes. We verify HMAC + state, exchange the code for an access
 * token, store the installation, register the uninstall webhook, and
 * serve a small HTML page that asks the merchant to paste their
 * glow-pay API key. The form on that page POSTs back to this same
 * endpoint to bind the shop to a glow-pay merchant — keeping it on
 * one route reduces our serverless function count.
 *
 * POST — body { shop, apiKey } binds the shop to a merchant.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'POST') return handleLink(req, res)

  const clientId = process.env.SHOPIFY_CLIENT_ID
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return res.status(500).send('Shopify integration is not configured.')
  }

  const { shop, code, state, hmac } = req.query
  if (typeof shop !== 'string' || typeof code !== 'string' || typeof state !== 'string' || typeof hmac !== 'string') {
    return res.status(400).send('Missing required query parameters.')
  }
  if (!isValidShopDomain(shop)) {
    return res.status(400).send('Invalid shop domain.')
  }

  const expectedShop = await consumeState(state)
  if (!expectedShop || expectedShop !== shop) {
    return res.status(400).send('Invalid or expired state — please retry the install.')
  }

  const flatQuery: Record<string, string> = {}
  for (const [k, v] of Object.entries(req.query)) {
    if (typeof v === 'string') flatQuery[k] = v
  }
  if (!verifyOAuthHmac(flatQuery, clientSecret)) {
    return res.status(401).send('HMAC verification failed.')
  }

  let tokenResponse: { access_token: string; scope: string }
  try {
    tokenResponse = await exchangeCodeForToken(shop, code, clientId, clientSecret)
  } catch (err) {
    console.error('Shopify token exchange failed:', err)
    return res.status(502).send('Failed to obtain access token from Shopify.')
  }

  await saveInstallation({
    shop,
    accessToken: tokenResponse.access_token,
    scope: tokenResponse.scope,
    installedAt: new Date().toISOString(),
  })

  const baseUrl = `https://${req.headers.host}`
  registerUninstallWebhook(shop, tokenResponse.access_token, `${baseUrl}/api/shopify/webhooks/uninstalled`)
    .catch(err => console.warn('Uninstall webhook registration failed:', err))

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  return res.status(200).send(renderLinkPage(shop))
}

async function handleLink(req: VercelRequest, res: VercelResponse) {
  const { shop, apiKey } = req.body ?? {}
  if (!isValidShopDomain(typeof shop === 'string' ? shop : undefined)) {
    return res.status(400).json({ error: 'Invalid shop domain' })
  }
  if (!apiKey || typeof apiKey !== 'string') {
    return res.status(400).json({ error: 'Missing apiKey' })
  }

  const merchant = await getMerchantByApiKey(apiKey)
  if (!merchant) {
    return res.status(401).json({ error: 'Invalid Glow Pay API key' })
  }

  const install = await getInstallation(shop)
  if (!install) {
    return res.status(404).json({ error: 'Shopify installation not found — please reinstall the app' })
  }

  await saveInstallation({ ...install, merchantId: merchant.id, apiKey })
  return res.status(200).json({ success: true, merchantId: merchant.id, storeName: merchant.storeName })
}

function renderLinkPage(shop: string): string {
  const escapedShop = shop.replace(/[<>"&]/g, c => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', '&': '&amp;' }[c]!))
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Connect Glow Pay — ${escapedShop}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; background: linear-gradient(135deg, #0a0a0f 0%, #12121a 50%, #15101a 100%); color: #fff; margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
  .card { background: #12121a; border: 1px solid #24242f; border-radius: 16px; padding: 32px; max-width: 480px; width: 100%; box-shadow: 0 20px 60px rgba(168, 85, 247, 0.08); }
  h1 { margin: 0 0 8px; font-size: 22px; }
  p { color: #9ca3af; line-height: 1.5; }
  label { display: block; font-size: 13px; color: #d1d5db; margin: 16px 0 6px; }
  input { width: 100%; padding: 12px 14px; background: #0a0a0f; border: 1px solid #24242f; border-radius: 10px; color: #fff; font-size: 14px; box-sizing: border-box; font-family: ui-monospace, SFMono-Regular, monospace; }
  input:focus { outline: none; border-color: #a855f7; box-shadow: 0 0 0 3px rgba(168, 85, 247, 0.15); }
  button { width: 100%; margin-top: 20px; padding: 12px; background: #a855f7; color: #fff; font-weight: 600; border: 0; border-radius: 10px; font-size: 15px; cursor: pointer; transition: background 0.15s; }
  button:hover:not(:disabled) { background: #9333ea; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  .ok { color: #34d399; }
  .err { color: #f87171; }
  .muted { font-size: 12px; color: #6b7280; margin-top: 24px; }
  a { color: #a855f7; }
  a:hover { color: #d8b4fe; }
</style>
</head>
<body>
<div class="card">
  <h1>Connect ${escapedShop}</h1>
  <p>Paste your Glow Pay API key to link this Shopify store. Find it at <a href="https://glow-pay.co/dashboard/integration" target="_blank">glow-pay.co/dashboard/integration</a> → API keys.</p>
  <form id="f">
    <label for="apiKey">Glow Pay API key</label>
    <input id="apiKey" name="apiKey" placeholder="glow_..." autocomplete="off" required />
    <button type="submit" id="btn">Connect store</button>
    <p id="msg"></p>
  </form>
  <p class="muted">After connecting, follow the setup steps in the <a href="https://github.com/breez/glow-pay/tree/main/plugins/shopify-glow-pay" target="_blank">README</a> to enable the Bitcoin/Lightning manual payment method in Shopify.</p>
</div>
<script>
  const f = document.getElementById('f');
  const btn = document.getElementById('btn');
  const msg = document.getElementById('msg');
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const apiKey = document.getElementById('apiKey').value.trim();
    if (!apiKey) return;
    btn.disabled = true; msg.textContent = 'Connecting…'; msg.className = '';
    try {
      const r = await fetch('/api/shopify/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop: ${JSON.stringify(shop)}, apiKey }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Failed to connect');
      msg.textContent = 'Connected! You can close this tab and return to Shopify to finish setup.';
      msg.className = 'ok';
      btn.textContent = 'Connected';
    } catch (err) {
      msg.textContent = err.message; msg.className = 'err';
      btn.disabled = false;
    }
  });
</script>
</body>
</html>`
}
