import { useState, useEffect } from 'react'
import { Save, RefreshCw, Shield, Palette } from 'lucide-react'
import { getMerchant, saveMerchant, generateId, generateApiKey, generateSecret } from '@/lib/store'
import { syncMerchantToServer } from '@/lib/api-client'
import type { Merchant } from '@/lib/types'

export function DashboardSettings() {
  const [merchant, setMerchant] = useState<Merchant | null>(null)
  const [storeName, setStoreName] = useState('')
  const [rotationCount, setRotationCount] = useState(1)
  const [brandColor, setBrandColor] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    const m = getMerchant()
    if (m) {
      setMerchant(m)
      setStoreName(m.storeName || '')
      setRotationCount(m.rotationCount ?? 1)
      setBrandColor(m.brandColor || '')
      setLogoUrl(m.logoUrl || '')
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
        logoUrl: logoUrl || null,
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
        webhookUrl: updatedMerchant.webhookUrl,
        webhookSecret: updatedMerchant.webhookSecret,
        brandColor: updatedMerchant.brandColor,
        logoUrl: updatedMerchant.logoUrl,
      }).catch(err => console.warn('Failed to sync merchant to server:', err))

      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const isValidHex = (s: string) => /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s)

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold tracking-tight mb-1">Settings</h1>
      <p className="text-sm text-gray-400 mb-8">Manage your payment preferences and checkout branding.</p>

      <div className="space-y-6">
        {/* Privacy Rotation */}
        <div className="bg-surface-800/60 border border-white/[0.06] rounded-2xl p-6">
          <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-glow-400" />
            Privacy & Address Rotation
          </h2>
          <p className="text-gray-400 text-sm mb-4">
            Incoming payments are distributed across multiple addresses to enhance transaction privacy. A higher count provides stronger privacy but spreads your balance across more wallets.
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
              <p className="text-xs text-gray-500 mt-2">Hex color for buttons and accents on the checkout page. Leave empty for default.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Logo URL</label>
              <div className="flex gap-3">
                <input
                  type="url"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://example.com/logo.png"
                  className="flex-1 px-4 py-3 bg-surface-700 border border-white/[0.06] rounded-xl focus:outline-none focus:border-glow-400 transition-colors"
                />
                {logoUrl && (
                  <div className="w-12 h-12 rounded-xl border border-white/[0.06] flex-shrink-0 overflow-hidden bg-surface-700 flex items-center justify-center">
                    <img src={logoUrl} alt="" className="w-full h-full object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-2">Replaces the Glow Pay logo on the checkout page.</p>
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
    </div>
  )
}
