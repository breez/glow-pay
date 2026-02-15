import { useState, useEffect } from 'react'
import { Save, RefreshCw, Zap, Shield, AlertTriangle } from 'lucide-react'
import { getMerchant, saveMerchant, generateId, generateApiKey, generateSecret } from '@/lib/store'
import { syncMerchantToServer } from '@/lib/api-client'
import { useWallet } from '@/lib/wallet/WalletContext'
import type { Merchant } from '@/lib/types'

export function DashboardSettings() {
  const {
    allLightningAddresses,
    checkUsernameAvailable,
    setLightningUsername,
    enableRotation,
    refreshLightningAddress,
  } = useWallet()

  const [merchant, setMerchant] = useState<Merchant | null>(null)
  const [lightningUsername, setLightningUsernameState] = useState('')
  const [originalUsername, setOriginalUsername] = useState('')
  const [storeName, setStoreName] = useState('')
  const [redirectUrl, setRedirectUrl] = useState('')
  const [rotationEnabled, setRotationEnabled] = useState(false)
  const [rotationCount, setRotationCount] = useState(5)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [showAddresses, setShowAddresses] = useState(false)
  const [showUsernameWarning, setShowUsernameWarning] = useState(false)
  const [enablingRotation, setEnablingRotation] = useState(false)

  useEffect(() => {
    const m = getMerchant()
    if (m) {
      setMerchant(m)
      const username = m.lightningAddress.split('@')[0] || ''
      setLightningUsernameState(username)
      setOriginalUsername(username)
      setStoreName(m.storeName || '')
      setRedirectUrl(m.redirectUrl || '')
      setRotationEnabled(m.rotationEnabled ?? false)
      setRotationCount(m.rotationCount ?? 5)
    }
  }, [])

  const usernameChanged = lightningUsername !== originalUsername && originalUsername !== ''

  const handleSave = async () => {
    // If username changed and address already exists, show warning first
    if (usernameChanged && !showUsernameWarning) {
      setShowUsernameWarning(true)
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(false)
    setShowUsernameWarning(false)

    try {
      // If username changed, register the new address via SDK
      if (usernameChanged) {
        const available = await checkUsernameAvailable(lightningUsername)
        if (!available) {
          setError(`Username "${lightningUsername}" is not available.`)
          setSaving(false)
          return
        }
        await setLightningUsername(lightningUsername)
        await refreshLightningAddress()
      }

      const fullAddress = `${lightningUsername}@breez.cash`
      const updatedMerchant: Merchant = {
        id: merchant?.id || generateId(),
        lightningAddress: fullAddress,
        lightningAddresses: allLightningAddresses.length > 0
          ? allLightningAddresses
          : (merchant?.lightningAddresses || [fullAddress]),
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
        rotationEnabled,
        rotationCount,
        createdAt: merchant?.createdAt || new Date().toISOString(),
      }

      saveMerchant(updatedMerchant)
      setMerchant(updatedMerchant)
      setOriginalUsername(lightningUsername)

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

  const handleToggleRotation = async (enabled: boolean) => {
    if (enabled && !rotationEnabled) {
      // Enable rotation: expand wallet pool and register addresses
      setEnablingRotation(true)
      setError(null)
      try {
        const addresses = await enableRotation(rotationCount)
        setRotationEnabled(true)

        // Update merchant with new addresses
        if (merchant) {
          const updatedMerchant: Merchant = {
            ...merchant,
            rotationEnabled: true,
            rotationCount,
            lightningAddresses: addresses,
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
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to enable rotation')
      } finally {
        setEnablingRotation(false)
      }
    } else {
      setRotationEnabled(false)
      if (merchant) {
        const updatedMerchant: Merchant = { ...merchant, rotationEnabled: false }
        saveMerchant(updatedMerchant)
        setMerchant(updatedMerchant)
      }
    }
  }

  const allAddresses = merchant?.lightningAddresses || allLightningAddresses
  // Rotation addresses only (skip primary at index 0), limited to rotationCount
  const rotationAddresses = allAddresses.slice(1, 1 + rotationCount)

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
            Your primary Lightning address for receiving payments.
          </p>
          <div className="relative flex">
            <input
              type="text"
              value={lightningUsername}
              onChange={(e) => setLightningUsernameState(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
              placeholder="yourname"
              className="flex-1 px-4 py-3 bg-surface-700 border border-white/10 border-r-0 rounded-l-xl focus:outline-none focus:border-glow-400 focus:z-10 transition-colors"
            />
            <div className="px-4 py-3 bg-surface-900 border border-white/10 rounded-r-xl text-gray-400 font-medium flex items-center">
              @breez.cash
            </div>
          </div>

          {/* Username change warning */}
          {showUsernameWarning && (
            <div className="mt-4 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
                <div>
                  <p className="font-bold text-amber-400 mb-1">Confirm Username Change</p>
                  <p className="text-sm text-gray-300">
                    Changing your Lightning Address username will permanently release '{originalUsername}@breez.cash', making it available for other users.
                  </p>
                  <p className="text-sm text-gray-300 mt-2">Do you want to proceed?</p>
                  <div className="flex gap-3 mt-3">
                    <button
                      onClick={handleSave}
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-surface-900 font-bold rounded-lg text-sm transition-colors"
                    >
                      Change
                    </button>
                    <button
                      onClick={() => setShowUsernameWarning(false)}
                      className="px-4 py-2 bg-surface-700 hover:bg-surface-600 rounded-lg text-sm transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Privacy Rotation */}
        <div className="bg-surface-800/50 border border-white/10 rounded-2xl p-6">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-glow-400" />
            Privacy Rotation
          </h2>
          <p className="text-gray-400 text-sm mb-4">
            Distribute payments across multiple random addresses for enhanced privacy. Each address is a separate wallet derived from your seed.
          </p>

          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium">Enable address rotation</span>
            <button
              onClick={() => handleToggleRotation(!rotationEnabled)}
              disabled={enablingRotation}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                rotationEnabled ? 'bg-glow-400' : 'bg-surface-600'
              } ${enablingRotation ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                rotationEnabled ? 'translate-x-6' : 'translate-x-0.5'
              }`} />
            </button>
          </div>

          {enablingRotation && (
            <div className="flex items-center gap-2 text-sm text-glow-400 mb-4">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Setting up rotation wallets...
            </div>
          )}

          {rotationEnabled && (
            <>
              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-2">
                  Number of rotation addresses: <span className="text-white font-bold">{rotationCount}</span>
                </label>
                <input
                  type="range"
                  min={3}
                  max={10}
                  value={rotationCount}
                  onChange={(e) => setRotationCount(Number(e.target.value))}
                  className="w-full accent-glow-400"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>3</span>
                  <span>10</span>
                </div>
              </div>

              {/* Show rotation addresses (excludes primary) */}
              {rotationAddresses.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowAddresses(!showAddresses)}
                    className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-400"
                  >
                    <Shield className="w-4 h-4" />
                    {showAddresses ? 'Hide' : 'Show'} {rotationAddresses.length} rotation addresses
                  </button>
                  {showAddresses && (
                    <div className="mt-3 space-y-2">
                      {rotationAddresses.map((addr: string, i: number) => (
                        <div
                          key={addr}
                          className="flex items-center justify-between px-3 py-2 bg-surface-900 rounded-lg text-sm"
                        >
                          <span className="font-mono text-gray-400">{addr}</span>
                          <span className="text-xs text-gray-600">Rotation {i + 1}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
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
