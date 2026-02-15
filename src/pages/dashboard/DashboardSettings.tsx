import { useState, useEffect } from 'react'
import { Save, Copy, Check, RefreshCw, Zap, Shield, Code } from 'lucide-react'
import { getMerchant, saveMerchant, generateId, generateApiKey, generateSecret } from '@/lib/store'
import { syncMerchantToServer } from '@/lib/api-client'
import { fetchLnurlPayInfo } from '@/lib/lnurl'
import { useWallet } from '@/lib/wallet/WalletContext'
import type { Merchant } from '@/lib/types'

export function DashboardSettings() {
  const { allLightningAddresses } = useWallet()
  const [merchant, setMerchant] = useState<Merchant | null>(null)
  const [lightningUsername, setLightningUsername] = useState('')
  const [storeName, setStoreName] = useState('')
  const [redirectUrl, setRedirectUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [validating, setValidating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [copiedKey, setCopiedKey] = useState(false)
  const [showAddresses, setShowAddresses] = useState(false)

  useEffect(() => {
    const m = getMerchant()
    if (m) {
      setMerchant(m)
      // Extract username from full address (e.g., "user@breez.cash" -> "user")
      const username = m.lightningAddress.split('@')[0] || ''
      setLightningUsername(username)
      setStoreName(m.storeName || '')
      setRedirectUrl(m.redirectUrl || '')
    }
  }, [])

  const validateLightningAddress = async (username: string): Promise<boolean> => {
    try {
      setValidating(true)
      setError(null)
      const fullAddress = `${username}@breez.cash`
      await fetchLnurlPayInfo(fullAddress)
      return true
    } catch {
      setError('Invalid username. Make sure this matches your Glow wallet username.')
      return false
    } finally {
      setValidating(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(false)

    // Validate Lightning address
    const isValid = await validateLightningAddress(lightningUsername)
    if (!isValid) {
      setSaving(false)
      return
    }

    // Create or update merchant
    const fullAddress = `${lightningUsername}@breez.cash`
    const updatedMerchant: Merchant = {
      id: merchant?.id || generateId(),
      lightningAddress: fullAddress,
      lightningAddresses: merchant?.lightningAddresses || allLightningAddresses.length > 0
        ? (merchant?.lightningAddresses || allLightningAddresses)
        : [fullAddress],
      storeName,
      redirectUrl: redirectUrl || null,
      redirectSecret: merchant?.redirectSecret || generateSecret(),
      apiKey: merchant?.apiKey || generateApiKey(),
      createdAt: merchant?.createdAt || new Date().toISOString(),
    }

    saveMerchant(updatedMerchant)
    setMerchant(updatedMerchant)

    // Sync to server for API access
    syncMerchantToServer({
      merchantId: updatedMerchant.id,
      apiKey: updatedMerchant.apiKey,
      storeName: updatedMerchant.storeName,
      lightningAddresses: updatedMerchant.lightningAddresses,
      redirectUrl: updatedMerchant.redirectUrl,
    }).catch(err => console.warn('Failed to sync merchant to server:', err))

    setSaving(false)
    setSuccess(true)
    setTimeout(() => setSuccess(false), 3000)
  }

  const copyApiKey = async () => {
    if (!merchant?.apiKey) return
    await navigator.clipboard.writeText(merchant.apiKey)
    setCopiedKey(true)
    setTimeout(() => setCopiedKey(false), 2000)
  }

  const regenerateApiKey = () => {
    if (!merchant) return
    const newKey = generateApiKey()
    const updatedMerchant = { ...merchant, apiKey: newKey }
    saveMerchant(updatedMerchant)
    setMerchant(updatedMerchant)
  }

  const addresses = merchant?.lightningAddresses || allLightningAddresses

  return (
    <div className="max-w-2xl">
      <h1 className="text-3xl font-bold mb-2">Settings</h1>
      <p className="text-gray-400 mb-8">Configure your merchant account</p>

      <div className="space-y-6">
        {/* Lightning Address */}
        <div className="bg-surface-800/50 border border-white/10 rounded-2xl p-6">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5 text-glow-400" />
            Lightning Address
          </h2>
          <p className="text-gray-400 text-sm mb-4">
            Your primary Lightning address. Payments are distributed across rotation addresses for privacy.
          </p>
          <div className="relative flex">
            <input
              type="text"
              value={lightningUsername}
              onChange={(e) => setLightningUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
              placeholder="yourname"
              className="flex-1 px-4 py-3 bg-surface-700 border border-white/10 border-r-0 rounded-l-xl focus:outline-none focus:border-glow-400 focus:z-10 transition-colors"
            />
            <div className="px-4 py-3 bg-surface-900 border border-white/10 rounded-r-xl text-gray-400 font-medium flex items-center">
              @breez.cash
              {validating && (
                <RefreshCw className="w-4 h-4 animate-spin text-gray-400 ml-2" />
              )}
            </div>
          </div>

          {/* Rotation addresses */}
          {addresses.length > 1 && (
            <div className="mt-4">
              <button
                onClick={() => setShowAddresses(!showAddresses)}
                className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-400"
              >
                <Shield className="w-4 h-4" />
                {showAddresses ? 'Hide' : 'Show'} {addresses.length} rotation addresses
              </button>
              {showAddresses && (
                <div className="mt-3 space-y-2">
                  {addresses.map((addr: string, i: number) => (
                    <div
                      key={addr}
                      className="flex items-center justify-between px-3 py-2 bg-surface-900 rounded-lg text-sm"
                    >
                      <span className="font-mono text-gray-400">{addr}</span>
                      <span className={`text-xs ${i === 0 ? 'text-glow-400' : 'text-gray-600'}`}>
                        {i === 0 ? 'Primary' : `Rotation ${i}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Store Info */}
        <div className="bg-surface-800/50 border border-white/10 rounded-2xl p-6">
          <h2 className="text-lg font-bold mb-4">Store Information</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">Store Name (optional)</label>
              <input
                type="text"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="My Store"
                className="w-full px-4 py-3 bg-surface-700 border border-white/10 rounded-xl focus:outline-none focus:border-glow-400 transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">Success Redirect URL (optional)</label>
              <input
                type="url"
                value={redirectUrl}
                onChange={(e) => setRedirectUrl(e.target.value)}
                placeholder="https://yoursite.com/success"
                className="w-full px-4 py-3 bg-surface-700 border border-white/10 rounded-xl focus:outline-none focus:border-glow-400 transition-colors"
              />
              <p className="text-xs text-gray-500 mt-2">
                After successful payment, customers will be redirected here with ?payment_id=xxx&status=paid&amount_sats=xxx
              </p>
            </div>
          </div>
        </div>

        {/* API Key (only show if merchant exists) */}
        {merchant && (
          <div className="bg-surface-800/50 border border-white/10 rounded-2xl p-6">
            <h2 className="text-lg font-bold mb-4">API Key</h2>
            <p className="text-gray-400 text-sm mb-4">
              Use this key to create payments programmatically via the API.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={merchant.apiKey}
                readOnly
                className="flex-1 px-4 py-3 bg-surface-900 border border-white/10 rounded-xl font-mono text-sm text-gray-400"
              />
              <button
                onClick={copyApiKey}
                className="px-4 py-3 bg-surface-700 hover:bg-surface-600 rounded-xl transition-colors"
                title="Copy API key"
              >
                {copiedKey ? (
                  <Check className="w-5 h-5 text-green-400" />
                ) : (
                  <Copy className="w-5 h-5" />
                )}
              </button>
              <button
                onClick={regenerateApiKey}
                className="px-4 py-3 bg-surface-700 hover:bg-surface-600 rounded-xl transition-colors"
                title="Regenerate API key"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* API Integration */}
        {merchant && (
          <div className="bg-surface-800/50 border border-white/10 rounded-2xl p-6">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Code className="w-5 h-5 text-glow-400" />
              API Integration
            </h2>
            <p className="text-gray-400 text-sm mb-4">
              Create payments from your e-commerce site using the API.
            </p>

            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-400 mb-2">Create a payment</p>
                <pre className="bg-surface-900 rounded-xl p-4 text-xs font-mono text-gray-300 overflow-x-auto whitespace-pre">{`curl -X POST ${window.location.origin}/api/payments \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: ${merchant.apiKey}" \\
  -d '{"amountSats": 1000, "description": "Order #123"}'`}</pre>
              </div>

              <div>
                <p className="text-sm text-gray-400 mb-2">Check payment status</p>
                <pre className="bg-surface-900 rounded-xl p-4 text-xs font-mono text-gray-300 overflow-x-auto whitespace-pre">{`curl ${window.location.origin}/api/payments/{paymentId}`}</pre>
              </div>

              <div>
                <p className="text-sm text-gray-400 mb-2">Response</p>
                <pre className="bg-surface-900 rounded-xl p-4 text-xs font-mono text-gray-300 overflow-x-auto whitespace-pre">{`{
  "paymentId": "...",
  "paymentUrl": "https://...",
  "invoice": "lnbc...",
  "expiresAt": "...",
  "amountSats": 1000
}`}</pre>
              </div>
            </div>
          </div>
        )}

        {/* Error/Success messages */}
        {error && (
          <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-4 text-red-400">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-green-500/20 border border-green-500/30 rounded-xl p-4 text-green-400">
            Settings saved successfully!
          </div>
        )}

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saving || !lightningUsername}
          className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-glow-400 hover:bg-glow-300 disabled:bg-gray-600 disabled:cursor-not-allowed text-surface-900 font-bold rounded-xl transition-colors"
        >
          {saving ? (
            <>
              <RefreshCw className="w-5 h-5 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-5 h-5" />
              Save Settings
            </>
          )}
        </button>
      </div>
    </div>
  )
}
