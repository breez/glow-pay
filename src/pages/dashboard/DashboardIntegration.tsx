import { useState, useEffect } from 'react'
import { Copy, Check, Plus, X, Key, Code, RefreshCw } from 'lucide-react'
import { getMerchant, saveMerchant, generateApiKey } from '@/lib/store'
import { syncMerchantToServer } from '@/lib/api-client'
import type { Merchant, ApiKey } from '@/lib/types'

export function DashboardIntegration() {
  const [merchant, setMerchant] = useState<Merchant | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [showCreateKey, setShowCreateKey] = useState(false)
  const [newKeyLabel, setNewKeyLabel] = useState('')
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    setMerchant(getMerchant())
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

    await syncKeys(updatedMerchant)
  }

  const revokeApiKey = async (keyToRevoke: string) => {
    if (!merchant) return

    const updatedKeys = merchant.apiKeys.map(k =>
      k.key === keyToRevoke ? { ...k, active: false } : k
    )

    // Update backward-compat apiKey to first active
    const firstActive = updatedKeys.find(k => k.active)
    const updatedMerchant: Merchant = {
      ...merchant,
      apiKeys: updatedKeys,
      apiKey: firstActive?.key || merchant.apiKey,
    }

    saveMerchant(updatedMerchant)
    setMerchant(updatedMerchant)

    await syncKeys(updatedMerchant)
  }

  const syncKeys = async (m: Merchant) => {
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
        <h1 className="text-3xl font-bold mb-2">Integration</h1>
        <p className="text-gray-400">Complete setup to access API integration.</p>
      </div>
    )
  }

  const activeKeys = merchant.apiKeys.filter(k => k.active)
  const revokedKeys = merchant.apiKeys.filter(k => !k.active)
  const displayKey = activeKeys[0]?.key || merchant.apiKey

  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-bold mb-2">Integration</h1>
      <p className="text-gray-400 mb-8">API keys and integration guides for your e-commerce site</p>

      <div className="space-y-6">
        {/* API Keys */}
        <div className="bg-surface-800/50 border border-white/10 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold flex items-center gap-2">
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
            <div className="mb-4 p-4 bg-surface-900 rounded-xl border border-white/10">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newKeyLabel}
                  onChange={(e) => setNewKeyLabel(e.target.value)}
                  placeholder="Key label (e.g., Production, Staging)"
                  className="flex-1 px-3 py-2 bg-surface-700 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-glow-400 transition-colors"
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
              <div key={apiKey.key} className="flex items-center gap-3 p-3 bg-surface-900 rounded-xl">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium">{apiKey.label}</span>
                    <span className="text-xs px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded">Active</span>
                  </div>
                  <code className="text-xs text-gray-400 font-mono block truncate">{apiKey.key}</code>
                  <span className="text-xs text-gray-600">Created {new Date(apiKey.createdAt).toLocaleDateString()}</span>
                </div>
                <button
                  onClick={() => copyToClipboard(apiKey.key, apiKey.key)}
                  className="p-2 bg-surface-700 hover:bg-surface-600 rounded-lg transition-colors shrink-0"
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
                        <span className="text-xs px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded">Revoked</span>
                      </div>
                      <code className="text-xs text-gray-600 font-mono block truncate">{apiKey.key}</code>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* API Documentation */}
        <div className="bg-surface-800/50 border border-white/10 rounded-2xl p-6">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Code className="w-5 h-5 text-glow-400" />
            API Reference
          </h2>
          <p className="text-gray-400 text-sm mb-6">
            Create and manage payments from your e-commerce site using the REST API.
          </p>

          <div className="space-y-6">
            {/* Create Payment */}
            <div>
              <h3 className="text-sm font-bold text-glow-400 mb-1">POST /api/payments</h3>
              <p className="text-xs text-gray-400 mb-3">Create a new payment request. Returns a payment URL and Lightning invoice.</p>
              <div className="relative">
                <pre className="bg-surface-900 rounded-xl p-4 text-xs font-mono text-gray-300 overflow-x-auto whitespace-pre">{`curl -X POST ${window.location.origin}/api/payments \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: ${displayKey}" \\
  -d '{"amountSats": 1000, "description": "Order #123"}'`}</pre>
                <button
                  onClick={() => copyToClipboard(
                    `curl -X POST ${window.location.origin}/api/payments \\\n  -H "Content-Type: application/json" \\\n  -H "X-API-Key: ${displayKey}" \\\n  -d '{"amountSats": 1000, "description": "Order #123"}'`,
                    'curl-create'
                  )}
                  className="absolute top-2 right-2 p-1.5 bg-surface-700 hover:bg-surface-600 rounded-lg transition-colors"
                >
                  {copiedKey === 'curl-create' ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Response */}
            <div>
              <h3 className="text-sm font-bold text-gray-300 mb-1">Response</h3>
              <pre className="bg-surface-900 rounded-xl p-4 text-xs font-mono text-gray-300 overflow-x-auto whitespace-pre">{`{
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

            {/* Check status */}
            <div>
              <h3 className="text-sm font-bold text-glow-400 mb-1">GET /api/payments/:id</h3>
              <p className="text-xs text-gray-400 mb-3">Check payment status. No authentication required.</p>
              <pre className="bg-surface-900 rounded-xl p-4 text-xs font-mono text-gray-300 overflow-x-auto whitespace-pre">{`curl ${window.location.origin}/api/payments/{paymentId}`}</pre>
            </div>

            {/* JS Example */}
            <div>
              <h3 className="text-sm font-bold text-gray-300 mb-1">JavaScript Example</h3>
              <div className="relative">
                <pre className="bg-surface-900 rounded-xl p-4 text-xs font-mono text-gray-300 overflow-x-auto whitespace-pre">{`const response = await fetch('${window.location.origin}/api/payments', {
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

const { data } = await response.json();
// Redirect customer to payment page
window.location.href = data.paymentUrl;`}</pre>
                <button
                  onClick={() => copyToClipboard(
                    `const response = await fetch('${window.location.origin}/api/payments', {\n  method: 'POST',\n  headers: {\n    'Content-Type': 'application/json',\n    'X-API-Key': '${displayKey}',\n  },\n  body: JSON.stringify({\n    amountSats: 1000,\n    description: 'Order #123',\n  }),\n});\n\nconst { data } = await response.json();\n// Redirect customer to payment page\nwindow.location.href = data.paymentUrl;`,
                    'js-example'
                  )}
                  className="absolute top-2 right-2 p-1.5 bg-surface-700 hover:bg-surface-600 rounded-lg transition-colors"
                >
                  {copiedKey === 'js-example' ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
