import { useState, useEffect } from 'react'
import { Save, RefreshCw, Shield } from 'lucide-react'
import { getMerchant, saveMerchant, generateId, generateApiKey, generateSecret } from '@/lib/store'
import { syncMerchantToServer } from '@/lib/api-client'
import type { Merchant } from '@/lib/types'

export function DashboardSettings() {
  const [merchant, setMerchant] = useState<Merchant | null>(null)
  const [storeName, setStoreName] = useState('')
  const [redirectUrl, setRedirectUrl] = useState('')
  const [rotationCount, setRotationCount] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    const m = getMerchant()
    if (m) {
      setMerchant(m)
      setStoreName(m.storeName || '')
      setRedirectUrl(m.redirectUrl || '')
      setRotationCount(m.rotationCount ?? 1)
    }
  }, [])

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
        redirectUrl: redirectUrl || null,
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
        createdAt: merchant?.createdAt || new Date().toISOString(),
      }

      saveMerchant(updatedMerchant)
      setMerchant(updatedMerchant)

      // Sync to server
      const activeKeys = updatedMerchant.apiKeys.filter(k => k.active)
      await syncMerchantToServer({
        merchantId: updatedMerchant.id,
        apiKey: activeKeys[0]?.key || updatedMerchant.apiKey,
        apiKeys: updatedMerchant.apiKeys,
        storeName: updatedMerchant.storeName,
        lightningAddresses: updatedMerchant.lightningAddresses,
        redirectUrl: updatedMerchant.redirectUrl,
        rotationEnabled: updatedMerchant.rotationEnabled,
        rotationCount: updatedMerchant.rotationCount,
      }).catch(err => console.warn('Failed to sync merchant to server:', err))

      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-3xl font-bold mb-2">Settings</h1>
      <p className="text-gray-400 mb-8">Configure your merchant account</p>

      <div className="space-y-6">
        {/* Privacy Rotation */}
        <div className="bg-surface-800/50 border border-white/10 rounded-2xl p-6">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-glow-400" />
            Payment Addresses
          </h2>
          <p className="text-gray-400 text-sm mb-4">
            Payments are distributed across random addresses for privacy. Increase the count to spread payments across more addresses.
          </p>

          <div>
            <label className="block text-sm text-gray-400 mb-2">
              Active addresses: <span className="text-white font-bold">{rotationCount}</span>
            </label>
            <input
              type="range"
              min={1}
              max={10}
              value={rotationCount}
              onChange={(e) => setRotationCount(Number(e.target.value))}
              className="w-full accent-glow-400"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>1</span>
              <span>10</span>
            </div>
          </div>
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
          disabled={saving}
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
