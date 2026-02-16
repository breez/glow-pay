import { useState, useEffect } from 'react'
import { Save, RefreshCw, Shield, Palette, Copy, Check, Plus, X, Key, Code, Webhook, ExternalLink } from 'lucide-react'
import { getMerchant, saveMerchant, generateId, generateApiKey, generateSecret } from '@/lib/store'
import { syncMerchantToServer } from '@/lib/api-client'
import type { Merchant, ApiKey } from '@/lib/types'

type Tab = 'settings' | 'api'
type CodeTabType = 'curl' | 'js' | 'response'

function CodeTabs({ curl, js, response, copyId, copiedKey, onCopy }: {
  curl: string
  js: string
  response: string
  copyId: string
  copiedKey: string | null
  onCopy: (text: string, id: string) => void
}) {
  const [tab, setTab] = useState<CodeTabType>('curl')
  const content = tab === 'curl' ? curl : tab === 'js' ? js : response

  return (
    <div>
      <div className="flex gap-1 mb-2">
        {(['curl', 'js', 'response'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              tab === t
                ? 'bg-glow-400/20 text-glow-400'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {t === 'curl' ? 'cURL' : t === 'js' ? 'JavaScript' : 'Response'}
          </button>
        ))}
      </div>
      <div className="relative">
        <pre className="bg-surface-900 rounded-xl p-4 text-xs font-mono text-gray-300 leading-relaxed overflow-x-auto whitespace-pre border border-white/[0.04]">
          {content}
        </pre>
        {tab !== 'response' && (
          <button
            onClick={() => onCopy(content, `${copyId}-${tab}`)}
            className="absolute top-2 right-2 p-2 bg-surface-800/80 border border-white/[0.06] hover:bg-surface-700 rounded-lg transition-colors"
          >
            {copiedKey === `${copyId}-${tab}` ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>
    </div>
  )
}

export function DashboardSettings() {
  const [tab, setTab] = useState<Tab>('settings')
  const [merchant, setMerchant] = useState<Merchant | null>(null)

  // Settings state
  const [storeName, setStoreName] = useState('')
  const [rotationCount, setRotationCount] = useState(1)
  const [brandColor, setBrandColor] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [brandBackground, setBrandBackground] = useState('')
  const [logoError, setLogoError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // API state
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [showCreateKey, setShowCreateKey] = useState(false)
  const [newKeyLabel, setNewKeyLabel] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [redirectUrl, setRedirectUrl] = useState('')
  const [savingConfig, setSavingConfig] = useState(false)
  const [configSaved, setConfigSaved] = useState(false)

  useEffect(() => {
    const m = getMerchant()
    if (m) {
      setMerchant(m)
      setStoreName(m.storeName || '')
      setRotationCount(m.rotationCount ?? 1)
      setBrandColor(m.brandColor || '')
      setLogoUrl(m.logoUrl || '')
      setBrandBackground(m.brandBackground || '')
      setWebhookUrl(m.webhookUrl || '')
      setRedirectUrl(m.redirectUrl || '')
    }
  }, [])

  const isValidHex = (s: string) => /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s)

  // --- Settings save ---
  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(false)

    try {
      const updatedMerchant: Merchant = {
        id: merchant?.id || generateId(),
        lightningAddress: merchant?.lightningAddress || '',
        lightningAddresses: merchant?.lightningAddresses || [],
        storeName,
        redirectUrl: merchant?.redirectUrl ?? null,
        redirectSecret: merchant?.redirectSecret || generateSecret(),
        apiKey: merchant?.apiKey || generateApiKey(),
        apiKeys: merchant?.apiKeys || [{
          key: merchant?.apiKey || generateApiKey(),
          label: 'Default',
          createdAt: new Date().toISOString(),
          active: true,
        }],
        rotationEnabled: true,
        rotationCount,
        webhookUrl: merchant?.webhookUrl ?? null,
        webhookSecret: merchant?.webhookSecret ?? null,
        brandColor: brandColor || null,
        brandBackground: brandBackground || null,
        logoUrl: logoUrl || null,
        createdAt: merchant?.createdAt || new Date().toISOString(),
      }

      saveMerchant(updatedMerchant)
      setMerchant(updatedMerchant)
      await syncToServer(updatedMerchant)

      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  // --- API helpers ---
  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedKey(id)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const createApiKeyHandler = async () => {
    if (!merchant || !newKeyLabel.trim()) return

    const newKey: ApiKey = {
      key: generateApiKey(),
      label: newKeyLabel.trim(),
      createdAt: new Date().toISOString(),
      active: true,
    }

    const updated: Merchant = {
      ...merchant,
      apiKeys: [...merchant.apiKeys, newKey],
    }

    saveMerchant(updated)
    setMerchant(updated)
    setNewKeyLabel('')
    setShowCreateKey(false)
    await syncToServer(updated)
  }

  const revokeApiKey = async (keyToRevoke: string) => {
    if (!merchant) return

    const updatedKeys = merchant.apiKeys.map(k =>
      k.key === keyToRevoke ? { ...k, active: false } : k
    )

    const firstActive = updatedKeys.find(k => k.active)
    const updated: Merchant = {
      ...merchant,
      apiKeys: updatedKeys,
      apiKey: firstActive?.key || merchant.apiKey,
    }

    saveMerchant(updated)
    setMerchant(updated)
    await syncToServer(updated)
  }

  const handleSaveConfig = async () => {
    if (!merchant) return

    setSavingConfig(true)
    setConfigSaved(false)

    const needsSecret = webhookUrl && !merchant.webhookSecret
    const updated: Merchant = {
      ...merchant,
      webhookUrl: webhookUrl || null,
      webhookSecret: needsSecret ? generateSecret() : (merchant.webhookSecret ?? null),
      redirectUrl: redirectUrl || null,
    }

    saveMerchant(updated)
    setMerchant(updated)
    await syncToServer(updated)
    setSavingConfig(false)
    setConfigSaved(true)
    setTimeout(() => setConfigSaved(false), 3000)
  }

  const syncToServer = async (m: Merchant) => {
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
        brandBackground: m.brandBackground,
        logoUrl: m.logoUrl,
      })
    } catch (err) {
      console.warn('Failed to sync merchant to server:', err)
    } finally {
      setSyncing(false)
    }
  }

  const activeKeys = merchant?.apiKeys.filter(k => k.active) || []
  const displayKey = activeKeys[0]?.key || merchant?.apiKey || ''
  const origin = window.location.origin

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight mb-1">Settings</h1>
      <p className="text-sm text-gray-400 mb-4">Manage your store, branding, API keys, and integrations.</p>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-surface-800/60 border border-white/[0.06] rounded-xl p-1 w-fit">
        <button
          onClick={() => setTab('settings')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'settings' ? 'bg-glow-400/15 text-glow-400' : 'text-gray-400 hover:text-white'
          }`}
        >
          General
        </button>
        <button
          onClick={() => setTab('api')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'api' ? 'bg-glow-400/15 text-glow-400' : 'text-gray-400 hover:text-white'
          }`}
        >
          API & Integration
        </button>
      </div>

      {/* General tab */}
      {tab === 'settings' && (
        <div className="space-y-6">
          {/* Privacy Rotation */}
          <div className="bg-surface-800/60 border border-white/[0.06] rounded-2xl p-6">
            <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5 text-glow-400" />
              Privacy & Address Rotation
            </h2>
            <p className="text-gray-400 text-sm mb-4">
              Incoming payments are distributed across multiple addresses to enhance transaction privacy.
            </p>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Active receiving addresses: <span className="text-white font-bold">{rotationCount}</span>
              </label>
              <input
                type="range"
                min={1}
                max={10}
                value={rotationCount}
                onChange={(e) => setRotationCount(Number(e.target.value))}
                className="w-full accent-glow-400"
              />
              <div className="flex justify-between mt-1 px-[2px]">
                {Array.from({ length: 10 }, (_, i) => (
                  <div
                    key={i}
                    className={`w-1 h-1 rounded-full ${i < rotationCount ? 'bg-glow-400/60' : 'bg-white/20'}`}
                  />
                ))}
              </div>
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>1</span>
                <span>10</span>
              </div>
            </div>
          </div>

          {/* Checkout Branding */}
          <div className="bg-surface-800/60 border border-white/[0.06] rounded-2xl p-6">
            <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
              <Palette className="w-5 h-5 text-glow-400" />
              Checkout Branding
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Checkout Display Name</label>
                <input
                  type="text"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder="e.g. Acme Electronics"
                  className="w-full px-4 py-3 bg-surface-700 border border-white/[0.06] rounded-xl focus:outline-none focus:border-glow-400 transition-colors"
                />
                <p className="text-xs text-gray-500 mt-2">Shown to customers on the payment page.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Brand Color</label>
                <div className="flex gap-3 items-center">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={brandColor}
                      onChange={(e) => setBrandColor(e.target.value)}
                      placeholder="#a855f7"
                      maxLength={7}
                      className="w-full px-4 py-3 bg-surface-700 border border-white/[0.06] rounded-xl focus:outline-none focus:border-glow-400 transition-colors font-mono"
                    />
                  </div>
                  <label
                    className="w-12 h-12 rounded-xl border border-white/[0.06] flex-shrink-0 cursor-pointer overflow-hidden relative"
                    style={{ backgroundColor: isValidHex(brandColor) ? brandColor : '#a855f7' }}
                  >
                    <input
                      type="color"
                      value={isValidHex(brandColor) && brandColor.length === 7 ? brandColor : '#a855f7'}
                      onChange={(e) => setBrandColor(e.target.value)}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                  </label>
                </div>
                <p className="text-xs text-gray-500 mt-2">Hex color for accents on the checkout page. Leave empty for default.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Background Color</label>
                <div className="flex gap-3 items-center">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={brandBackground}
                      onChange={(e) => setBrandBackground(e.target.value)}
                      placeholder="#0a0a0f"
                      maxLength={7}
                      className="w-full px-4 py-3 bg-surface-700 border border-white/[0.06] rounded-xl focus:outline-none focus:border-glow-400 transition-colors font-mono"
                    />
                  </div>
                  <label
                    className="w-12 h-12 rounded-xl border border-white/[0.06] flex-shrink-0 cursor-pointer overflow-hidden relative"
                    style={{ backgroundColor: isValidHex(brandBackground) ? brandBackground : '#0a0a0f' }}
                  >
                    <input
                      type="color"
                      value={isValidHex(brandBackground) && brandBackground.length === 7 ? brandBackground : '#0a0a0f'}
                      onChange={(e) => setBrandBackground(e.target.value)}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                  </label>
                </div>
                <p className="text-xs text-gray-500 mt-2">Background color for the checkout page. Leave empty for default.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Logo URL</label>
                <div className="flex gap-3 items-center">
                  <input
                    type="url"
                    value={logoUrl}
                    onChange={(e) => { setLogoUrl(e.target.value); setLogoError(false) }}
                    placeholder="https://example.com/logo.png"
                    className="flex-1 px-4 py-3 bg-surface-700 border border-white/[0.06] rounded-xl focus:outline-none focus:border-glow-400 transition-colors"
                  />
                  {logoUrl && !logoError && (
                    <div className="w-12 h-12 rounded-xl border border-white/[0.06] flex-shrink-0 overflow-hidden bg-surface-700 flex items-center justify-center">
                      <img src={logoUrl} alt="" crossOrigin="anonymous" className="w-full h-full object-contain" onError={() => setLogoError(true)} />
                    </div>
                  )}
                  {logoUrl && logoError && (
                    <div className="w-12 h-12 rounded-xl border border-red-500/30 flex-shrink-0 bg-red-500/10 flex items-center justify-center">
                      <span className="text-red-400 text-xs">!</span>
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Replaces the Glow Pay logo on the checkout page. The image must be served with CORS headers.
                  {logoError && <span className="text-red-400 ml-1">Image failed to load — the server may not allow cross-origin requests.</span>}
                </p>
              </div>
            </div>
          </div>

          {/* Error/Success messages */}
          {error && (
            <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-4 text-red-400">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-green-500/20 border border-green-500/30 rounded-xl p-4 text-green-400">
              Your changes have been saved.
            </div>
          )}

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-glow-400 hover:bg-glow-300 active:bg-glow-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-surface-900 font-bold rounded-xl transition-colors"
          >
            {saving ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                Save Changes
              </>
            )}
          </button>
        </div>
      )}

      {/* API & Integration tab */}
      {tab === 'api' && merchant && (
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
                    onKeyDown={(e) => e.key === 'Enter' && createApiKeyHandler()}
                    autoFocus
                  />
                  <button
                    onClick={createApiKeyHandler}
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
          </div>

          {/* Redirect & Webhooks */}
          <div className="bg-surface-800/60 border border-white/[0.06] rounded-2xl p-6">
            <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
              <Webhook className="w-5 h-5 text-glow-400" />
              Redirect & Webhooks
            </h2>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
                  <ExternalLink className="w-4 h-4" />
                  Post-Payment Redirect URL
                </label>
                <input
                  type="url"
                  value={redirectUrl}
                  onChange={(e) => setRedirectUrl(e.target.value)}
                  placeholder="https://yoursite.com/success"
                  className="w-full px-4 py-3 bg-surface-700 border border-white/[0.06] rounded-xl focus:outline-none focus:border-glow-400 transition-colors mt-2"
                />
                <p className="text-xs text-gray-500 mt-2">
                  After payment, the customer is redirected with <code className="text-gray-400">?payment_id=</code>, <code className="text-gray-400">&status=paid</code>, and <code className="text-gray-400">&amount_sats=</code>.
                </p>
              </div>

              <div className="pt-4 border-t border-white/5">
                <label className="block text-sm font-medium text-gray-400 mb-2">Webhook URL</label>
                <input
                  type="url"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://yoursite.com/api/glow-webhook"
                  className="w-full px-4 py-3 bg-surface-700 border border-white/[0.06] rounded-xl focus:outline-none focus:border-glow-400 transition-colors"
                />
                <p className="text-xs text-gray-500 mt-2">
                  POST on payment events. Signed with HMAC-SHA256 via <code className="text-gray-400">X-Glow-Signature</code>.
                </p>
              </div>

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

          {/* API Reference */}
          <div className="bg-surface-800/60 border border-white/[0.06] rounded-2xl p-6">
            <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
              <Code className="w-5 h-5 text-glow-400" />
              API Reference
            </h2>

            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-bold font-mono text-glow-400 mb-1">POST /api/payments</h3>
                <p className="text-xs text-gray-400 mb-3">Create a payment request. Returns a payment URL and invoice.</p>

                <CodeTabs
                  copyId="create"
                  copiedKey={copiedKey}
                  onCopy={copyToClipboard}
                  curl={`curl -X POST ${origin}/api/payments \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: ${displayKey}" \\
  -d '{"amountSats": 1000, "description": "Order #123"}'`}
                  js={`const res = await fetch('${origin}/api/payments', {
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
window.location.href = data.paymentUrl;`}
                  response={`{
  "success": true,
  "data": {
    "paymentId": "m2abc_xyz123",
    "paymentUrl": "${origin}/pay/...",
    "invoice": "lnbc...",
    "expiresAt": "2025-01-01T01:00:00Z",
    "amountSats": 1000
  }
}`}
                />
              </div>

              <div className="pt-6 border-t border-white/5">
                <h3 className="text-sm font-bold font-mono text-glow-400 mb-1">GET /api/payments/:id</h3>
                <p className="text-xs text-gray-400 mb-3">Check the current status of a payment. No authentication required.</p>

                <CodeTabs
                  copyId="get"
                  copiedKey={copiedKey}
                  onCopy={copyToClipboard}
                  curl={`curl ${origin}/api/payments/{paymentId}`}
                  js={`const res = await fetch(
  '${origin}/api/payments/{paymentId}'
);

const { data } = await res.json();
console.log(data.status); // 'pending' | 'completed' | 'expired'`}
                  response={`{
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
}`}
                />
              </div>

              <div className="pt-6 border-t border-white/5">
                <h3 className="text-sm font-bold font-mono text-glow-400 mb-1">Webhooks</h3>
                <p className="text-xs text-gray-400 mb-3">
                  When configured, Glow Pay sends a POST for each payment event. Verify the signature to ensure authenticity.
                </p>

                <div className="space-y-3 mb-4">
                  {[
                    { event: 'payment.created', desc: 'A new payment request was created' },
                    { event: 'payment.completed', desc: 'A payment was settled successfully' },
                    { event: 'payment.expired', desc: 'A payment invoice expired without being paid' },
                  ].map(({ event, desc }) => (
                    <div key={event} className="flex items-start gap-3 p-2.5 bg-surface-900 rounded-lg">
                      <code className="text-xs font-mono text-glow-400 whitespace-nowrap mt-0.5">{event}</code>
                      <span className="text-xs text-gray-400">{desc}</span>
                    </div>
                  ))}
                </div>

                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Example payload</p>
                <pre className="bg-surface-900 rounded-xl p-4 text-xs font-mono text-gray-300 leading-relaxed overflow-x-auto whitespace-pre border border-white/[0.04] mb-4">{`// Headers
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

                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Verify signature (Node.js)</p>
                <div className="relative">
                  <pre className="bg-surface-900 rounded-xl p-4 text-xs font-mono text-gray-300 leading-relaxed overflow-x-auto whitespace-pre border border-white/[0.04]">{`import { createHmac } from 'crypto';

function verifyWebhook(body, signature, secret) {
  const expected = createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  return signature === expected;
}

// In your handler:
const isValid = verifyWebhook(
  rawBody,
  req.headers['x-glow-signature'],
  '${merchant.webhookSecret || '<set a webhook URL above to generate a secret>'}'
);`}</pre>
                  <button
                    onClick={() => copyToClipboard(
                      `import { createHmac } from 'crypto';\n\nfunction verifyWebhook(body, signature, secret) {\n  const expected = createHmac('sha256', secret)\n    .update(body)\n    .digest('hex');\n  return signature === expected;\n}\n\n// In your handler:\nconst isValid = verifyWebhook(\n  rawBody,\n  req.headers['x-glow-signature'],\n  '${merchant.webhookSecret || ''}'\n);`,
                      'verify-webhook'
                    )}
                    className="absolute top-2 right-2 p-2 bg-surface-800/80 border border-white/[0.06] hover:bg-surface-700 rounded-lg transition-colors"
                  >
                    {copiedKey === 'verify-webhook' ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'api' && !merchant && (
        <div className="bg-surface-800/60 border border-white/[0.06] rounded-2xl p-6">
          <p className="text-sm text-gray-400">Complete setup to access API integration.</p>
        </div>
      )}
    </div>
  )
}
