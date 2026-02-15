import { useState, useEffect } from 'react'
import { Copy, Check, Plus, X, Key, Code, RefreshCw, Webhook, ExternalLink, Save } from 'lucide-react'
import { getMerchant, saveMerchant, generateApiKey, generateSecret } from '@/lib/store'
import { syncMerchantToServer } from '@/lib/api-client'
import type { Merchant, ApiKey } from '@/lib/types'

export function DashboardIntegration() {
  const [merchant, setMerchant] = useState<Merchant | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [showCreateKey, setShowCreateKey] = useState(false)
  const [newKeyLabel, setNewKeyLabel] = useState('')
  const [syncing, setSyncing] = useState(false)

  // Webhook + redirect state
  const [webhookUrl, setWebhookUrl] = useState('')
  const [redirectUrl, setRedirectUrl] = useState('')
  const [savingConfig, setSavingConfig] = useState(false)
  const [configSaved, setConfigSaved] = useState(false)

  useEffect(() => {
    const m = getMerchant()
    if (m) {
      setMerchant(m)
      setWebhookUrl(m.webhookUrl || '')
      setRedirectUrl(m.redirectUrl || '')
    }
  }, [])

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedKey(id)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const createApiKey = async () => {
    if (!merchant || !newKeyLabel.trim()) return

    const newKey: ApiKey = {
      key: generateApiKey(),
      label: newKeyLabel.trim(),
      createdAt: new Date().toISOString(),
      active: true,
    }

    const updatedMerchant: Merchant = {
      ...merchant,
      apiKeys: [...merchant.apiKeys, newKey],
    }

    saveMerchant(updatedMerchant)
    setMerchant(updatedMerchant)
    setNewKeyLabel('')
    setShowCreateKey(false)

    await syncMerchantState(updatedMerchant)
  }

  const revokeApiKey = async (keyToRevoke: string) => {
    if (!merchant) return

    const updatedKeys = merchant.apiKeys.map(k =>
      k.key === keyToRevoke ? { ...k, active: false } : k
    )

    const firstActive = updatedKeys.find(k => k.active)
    const updatedMerchant: Merchant = {
      ...merchant,
      apiKeys: updatedKeys,
      apiKey: firstActive?.key || merchant.apiKey,
    }

    saveMerchant(updatedMerchant)
    setMerchant(updatedMerchant)

    await syncMerchantState(updatedMerchant)
  }

  const handleSaveConfig = async () => {
    if (!merchant) return

    setSavingConfig(true)
    setConfigSaved(false)

    // Auto-generate webhook secret if setting URL for first time
    const needsSecret = webhookUrl && !merchant.webhookSecret
    const updatedMerchant: Merchant = {
      ...merchant,
      webhookUrl: webhookUrl || null,
      webhookSecret: needsSecret ? generateSecret() : (merchant.webhookSecret ?? null),
      redirectUrl: redirectUrl || null,
    }

    saveMerchant(updatedMerchant)
    setMerchant(updatedMerchant)

    await syncMerchantState(updatedMerchant)
    setSavingConfig(false)
    setConfigSaved(true)
    setTimeout(() => setConfigSaved(false), 3000)
  }

  const syncMerchantState = async (m: Merchant) => {
    setSyncing(true)
    try {
      const activeKeys = m.apiKeys.filter(k => k.active)
      await syncMerchantToServer({
        merchantId: m.id,
        apiKey: activeKeys[0]?.key || m.apiKey,
        apiKeys: m.apiKeys,
        storeName: m.storeName,
        lightningAddresses: m.lightningAddresses,
        redirectUrl: m.redirectUrl,
        rotationEnabled: m.rotationEnabled,
        rotationCount: m.rotationCount,
        webhookUrl: m.webhookUrl,
        webhookSecret: m.webhookSecret,
        brandColor: m.brandColor,
        logoUrl: m.logoUrl,
      })
    } catch (err) {
      console.warn('Failed to sync merchant to server:', err)
    } finally {
      setSyncing(false)
    }
  }

  if (!merchant) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold tracking-tight mb-1">API & Integration</h1>
        <p className="text-sm text-gray-400">Complete setup to access API integration.</p>
      </div>
    )
  }

  const activeKeys = merchant.apiKeys.filter(k => k.active)
  const revokedKeys = merchant.apiKeys.filter(k => !k.active)
  const displayKey = activeKeys[0]?.key || merchant.apiKey

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight mb-1">API & Integration</h1>
      <p className="text-sm text-gray-400 mb-8">Manage API keys, webhooks, and integrate Glow Pay with your application.</p>

      <div className="space-y-6">
        {/* API Keys */}
        <div className="bg-surface-800/60 border border-white/[0.06] rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Key className="w-5 h-5 text-glow-400" />
              API Keys
            </h2>
            <div className="flex items-center gap-2">
              {syncing && <RefreshCw className="w-4 h-4 animate-spin text-gray-400" />}
              <button
                onClick={() => setShowCreateKey(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-glow-400 hover:bg-glow-300 text-surface-900 font-semibold rounded-lg text-sm transition-colors"
              >
                <Plus className="w-4 h-4" />
                Create Key
              </button>
            </div>
          </div>

          {/* Create key form */}
          {showCreateKey && (
            <div className="mb-4 p-4 bg-surface-900 rounded-xl border border-white/[0.06]">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newKeyLabel}
                  onChange={(e) => setNewKeyLabel(e.target.value)}
                  placeholder="Key label (e.g., Production, Staging)"
                  className="flex-1 px-3 py-2 bg-surface-700 border border-white/[0.06] rounded-lg text-sm focus:outline-none focus:border-glow-400 transition-colors"
                  onKeyDown={(e) => e.key === 'Enter' && createApiKey()}
                  autoFocus
                />
                <button
                  onClick={createApiKey}
                  disabled={!newKeyLabel.trim()}
                  className="px-4 py-2 bg-glow-400 hover:bg-glow-300 disabled:bg-gray-600 text-surface-900 font-semibold rounded-lg text-sm transition-colors"
                >
                  Create
                </button>
                <button
                  onClick={() => { setShowCreateKey(false); setNewKeyLabel('') }}
                  className="px-2 py-2 bg-surface-700 hover:bg-surface-600 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Active keys */}
          <div className="space-y-3">
            {activeKeys.map((apiKey) => (
              <div key={apiKey.key} className="flex items-center gap-3 p-3 bg-surface-900 rounded-xl hover:bg-surface-800/80 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium">{apiKey.label}</span>
                    <span className="status-badge bg-green-500/20 text-green-400">Active</span>
                  </div>
                  <code className="text-xs text-gray-400 font-mono block truncate">{apiKey.key}</code>
                  <span className="text-xs text-gray-600">Created {new Date(apiKey.createdAt).toLocaleDateString()}</span>
                </div>
                <button
                  onClick={() => copyToClipboard(apiKey.key, apiKey.key)}
                  className="p-2 bg-surface-800/80 border border-white/[0.06] hover:bg-surface-700 rounded-lg transition-colors shrink-0"
                  title="Copy key"
                >
                  {copiedKey === apiKey.key ? (
                    <Check className="w-4 h-4 text-green-400" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
                <button
                  onClick={() => revokeApiKey(apiKey.key)}
                  disabled={activeKeys.length <= 1}
                  className="px-3 py-2 bg-red-500/20 hover:bg-red-500/30 disabled:opacity-30 disabled:cursor-not-allowed text-red-400 rounded-lg text-xs font-medium transition-colors shrink-0"
                  title={activeKeys.length <= 1 ? 'Cannot revoke last active key' : 'Revoke key'}
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>

          {/* Revoked keys */}
          {revokedKeys.length > 0 && (
            <div className="mt-4 pt-4 border-t border-white/5">
              <p className="text-xs text-gray-500 mb-2">Revoked keys</p>
              <div className="space-y-2">
                {revokedKeys.map((apiKey) => (
                  <div key={apiKey.key} className="flex items-center gap-3 p-2 opacity-50">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500">{apiKey.label}</span>
                        <span className="status-badge bg-red-500/20 text-red-400">Revoked</span>
                      </div>
                      <code className="text-xs text-gray-600 font-mono block truncate">{apiKey.key}</code>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Webhooks & Redirect */}
        <div className="bg-surface-800/60 border border-white/[0.06] rounded-2xl p-6">
          <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
            <Webhook className="w-5 h-5 text-glow-400" />
            Webhooks & Redirect
          </h2>

          <div className="space-y-4">
            {/* Webhook URL */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Webhook URL</label>
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://yoursite.com/api/glow-webhook"
                className="w-full px-4 py-3 bg-surface-700 border border-white/[0.06] rounded-xl focus:outline-none focus:border-glow-400 transition-colors"
              />
              <p className="text-xs text-gray-500 mt-2">
                We'll send a POST request here when a payment is created, completed, or expires. The payload is signed via the <code className="text-gray-400">X-Glow-Signature</code> header (HMAC-SHA256).
              </p>
            </div>

            {/* Webhook Secret */}
            {merchant.webhookSecret && (
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Webhook Secret</label>
                <div className="flex gap-2">
                  <code className="flex-1 px-4 py-3 bg-surface-700 border border-white/[0.06] rounded-xl text-xs font-mono text-gray-400 truncate block leading-relaxed">
                    {merchant.webhookSecret}
                  </code>
                  <button
                    onClick={() => copyToClipboard(merchant.webhookSecret!, 'webhook-secret')}
                    className="p-3 bg-surface-700 border border-white/[0.06] hover:bg-surface-600 rounded-xl transition-colors shrink-0"
                  >
                    {copiedKey === 'webhook-secret' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {/* Webhook Events */}
            <div>
              <p className="text-sm font-medium text-gray-400 mb-2">Events</p>
              <div className="space-y-2">
                {[
                  { event: 'payment.created', desc: 'Sent when a new payment request is created' },
                  { event: 'payment.completed', desc: 'Sent when a payment is settled on the Lightning Network' },
                  { event: 'payment.expired', desc: 'Sent when a payment invoice expires without being paid' },
                ].map(({ event, desc }) => (
                  <div key={event} className="flex items-start gap-3 p-3 bg-surface-900 rounded-lg">
                    <code className="text-xs font-mono text-glow-400 whitespace-nowrap mt-0.5">{event}</code>
                    <span className="text-xs text-gray-400">{desc}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Redirect URL (moved from Settings) */}
            <div className="pt-4 border-t border-white/5">
              <label className="block text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
                <ExternalLink className="w-4 h-4" />
                Post-Payment Redirect URL
              </label>
              <input
                type="url"
                value={redirectUrl}
                onChange={(e) => setRedirectUrl(e.target.value)}
                placeholder="https://yoursite.com/success"
                className="w-full px-4 py-3 bg-surface-700 border border-white/[0.06] rounded-xl focus:outline-none focus:border-glow-400 transition-colors"
              />
              <p className="text-xs text-gray-500 mt-2">
                After a successful payment, the customer is redirected here with <code className="text-gray-400">?payment_id=</code>, <code className="text-gray-400">&status=paid</code>, and <code className="text-gray-400">&amount_sats=</code> appended.
              </p>
            </div>

            {/* Save button for config */}
            <button
              onClick={handleSaveConfig}
              disabled={savingConfig}
              className="flex items-center gap-2 px-4 py-2.5 bg-glow-400 hover:bg-glow-300 disabled:bg-gray-600 text-surface-900 font-semibold rounded-lg text-sm transition-colors"
            >
              {savingConfig ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Configuration
                </>
              )}
            </button>
            {configSaved && (
              <p className="text-sm text-green-400">Configuration saved.</p>
            )}
          </div>
        </div>

        {/* API Documentation */}
        <div className="bg-surface-800/60 border border-white/[0.06] rounded-2xl p-6">
          <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
            <Code className="w-5 h-5 text-glow-400" />
            API Reference
          </h2>
          <p className="text-gray-400 text-sm mb-6">
            Use the REST API to create and verify payments programmatically.
          </p>

          <div className="space-y-8">
            {/* POST /api/payments */}
            <div>
              <h3 className="text-sm font-bold font-mono text-glow-400 mb-1">POST /api/payments</h3>
              <p className="text-xs text-gray-400 mb-3">Creates a payment request and returns a payment URL and invoice.</p>

              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">curl</p>
              <div className="relative">
                <pre className="bg-surface-900 rounded-xl p-5 text-xs font-mono text-gray-300 leading-relaxed overflow-x-auto whitespace-pre border border-white/[0.04]">{`curl -X POST ${window.location.origin}/api/payments \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: ${displayKey}" \\
  -d '{"amountSats": 1000, "description": "Order #123"}'`}</pre>
                <button
                  onClick={() => copyToClipboard(
                    `curl -X POST ${window.location.origin}/api/payments \\\n  -H "Content-Type: application/json" \\\n  -H "X-API-Key: ${displayKey}" \\\n  -d '{"amountSats": 1000, "description": "Order #123"}'`,
                    'curl-create'
                  )}
                  className="absolute top-2 right-2 p-2 bg-surface-800/80 border border-white/[0.06] hover:bg-surface-700 rounded-lg transition-colors"
                >
                  {copiedKey === 'curl-create' ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>

              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mt-4 mb-2">JavaScript</p>
              <div className="relative">
                <pre className="bg-surface-900 rounded-xl p-5 text-xs font-mono text-gray-300 leading-relaxed overflow-x-auto whitespace-pre border border-white/[0.04]">{`const res = await fetch('${window.location.origin}/api/payments', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': '${displayKey}',
  },
  body: JSON.stringify({
    amountSats: 1000,
    description: 'Order #123',
  }),
});

const { data } = await res.json();
// Redirect customer to payment page
window.location.href = data.paymentUrl;`}</pre>
                <button
                  onClick={() => copyToClipboard(
                    `const res = await fetch('${window.location.origin}/api/payments', {\n  method: 'POST',\n  headers: {\n    'Content-Type': 'application/json',\n    'X-API-Key': '${displayKey}',\n  },\n  body: JSON.stringify({\n    amountSats: 1000,\n    description: 'Order #123',\n  }),\n});\n\nconst { data } = await res.json();\nwindow.location.href = data.paymentUrl;`,
                    'js-create'
                  )}
                  className="absolute top-2 right-2 p-2 bg-surface-800/80 border border-white/[0.06] hover:bg-surface-700 rounded-lg transition-colors"
                >
                  {copiedKey === 'js-create' ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>

              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mt-4 mb-2">Response</p>
              <pre className="bg-surface-900 rounded-xl p-5 text-xs font-mono text-gray-300 leading-relaxed overflow-x-auto whitespace-pre border border-white/[0.04]">{`{
  "success": true,
  "data": {
    "paymentId": "m2abc_xyz123",
    "paymentUrl": "${window.location.origin}/pay/...",
    "invoice": "lnbc...",
    "expiresAt": "2025-01-01T01:00:00Z",
    "amountSats": 1000
  }
}`}</pre>
            </div>

            {/* GET /api/payments/:id */}
            <div>
              <h3 className="text-sm font-bold font-mono text-glow-400 mb-1">GET /api/payments/:id</h3>
              <p className="text-xs text-gray-400 mb-3">Returns the current status of a payment. No authentication required.</p>

              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">curl</p>
              <div className="relative">
                <pre className="bg-surface-900 rounded-xl p-5 text-xs font-mono text-gray-300 leading-relaxed overflow-x-auto whitespace-pre border border-white/[0.04]">{`curl ${window.location.origin}/api/payments/{paymentId}`}</pre>
                <button
                  onClick={() => copyToClipboard(
                    `curl ${window.location.origin}/api/payments/{paymentId}`,
                    'curl-get'
                  )}
                  className="absolute top-2 right-2 p-2 bg-surface-800/80 border border-white/[0.06] hover:bg-surface-700 rounded-lg transition-colors"
                >
                  {copiedKey === 'curl-get' ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>

              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mt-4 mb-2">JavaScript</p>
              <div className="relative">
                <pre className="bg-surface-900 rounded-xl p-5 text-xs font-mono text-gray-300 leading-relaxed overflow-x-auto whitespace-pre border border-white/[0.04]">{`const res = await fetch(
  '${window.location.origin}/api/payments/{paymentId}'
);

const { data } = await res.json();
console.log(data.status); // 'pending' | 'completed' | 'expired'`}</pre>
                <button
                  onClick={() => copyToClipboard(
                    `const res = await fetch(\n  '${window.location.origin}/api/payments/{paymentId}'\n);\n\nconst { data } = await res.json();\nconsole.log(data.status); // 'pending' | 'completed' | 'expired'`,
                    'js-get'
                  )}
                  className="absolute top-2 right-2 p-2 bg-surface-800/80 border border-white/[0.06] hover:bg-surface-700 rounded-lg transition-colors"
                >
                  {copiedKey === 'js-get' ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>

              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mt-4 mb-2">Response</p>
              <pre className="bg-surface-900 rounded-xl p-5 text-xs font-mono text-gray-300 leading-relaxed overflow-x-auto whitespace-pre border border-white/[0.04]">{`{
  "success": true,
  "data": {
    "id": "m2abc_xyz123",
    "amountSats": 1000,
    "description": "Order #123",
    "status": "completed",
    "createdAt": "2025-01-01T00:00:00Z",
    "expiresAt": "2025-01-01T00:10:00Z",
    "paidAt": "2025-01-01T00:02:30Z",
    "merchant": {
      "storeName": "Acme Electronics",
      "redirectUrl": null
    }
  }
}`}</pre>
            </div>

            {/* Webhook Payload */}
            <div>
              <h3 className="text-sm font-bold font-mono text-glow-400 mb-1">Webhook Payload</h3>
              <p className="text-xs text-gray-400 mb-3">Example payload sent to your webhook URL. Verify the signature using HMAC-SHA256 with your webhook secret.</p>
              <pre className="bg-surface-900 rounded-xl p-5 text-xs font-mono text-gray-300 leading-relaxed overflow-x-auto whitespace-pre border border-white/[0.04]">{`// Headers
X-Glow-Signature: <hmac-sha256 hex digest>

// Body
{
  "event": "payment.completed",
  "paymentId": "m2abc_xyz123",
  "amountSats": 1000,
  "status": "completed",
  "paidAt": "2025-01-01T00:02:30Z",
  "timestamp": "2025-01-01T00:02:31Z"
}`}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
