import { useState, useEffect } from 'react'
import { Save, RefreshCw, Shield, ArrowUpRight, CheckCircle, XCircle, Loader2, Wallet } from 'lucide-react'
import { getMerchant, saveMerchant, generateId, generateApiKey, generateSecret } from '@/lib/store'
import { syncMerchantToServer } from '@/lib/api-client'
import { useWallet } from '@/lib/wallet/WalletContext'
import type { SweepResult } from '@/lib/wallet/walletService'
import type { Merchant } from '@/lib/types'

type Tab = 'branding' | 'privacy' | 'wallet'

export function DashboardSettings() {
  const [tab, setTab] = useState<Tab>('branding')
  const [merchant, setMerchant] = useState<Merchant | null>(null)
  const { aggregateBalance, refreshAggregateBalance, sweepFunds } = useWallet()
  const [sweepDestination, setSweepDestination] = useState('')
  const [sweeping, setSweeping] = useState(false)
  const [sweepProgress, setSweepProgress] = useState('')
  const [sweepResults, setSweepResults] = useState<SweepResult[] | null>(null)
  const [sweepError, setSweepError] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [storeName, setStoreName] = useState('')
  const [rotationCount, setRotationCount] = useState(1)
  const [brandColor, setBrandColor] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [brandBackground, setBrandBackground] = useState('')
  const [logoError, setLogoError] = useState(false)
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
      setBrandBackground(m.brandBackground || '')
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
        brandBackground: brandBackground || null,
        logoUrl: logoUrl || null,
        createdAt: merchant?.createdAt || new Date().toISOString(),
      }

      saveMerchant(updatedMerchant)
      setMerchant(updatedMerchant)

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
        brandBackground: updatedMerchant.brandBackground,
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
      <p className="text-sm text-gray-400 mb-4">Manage your payment preferences and checkout branding.</p>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-surface-800/60 border border-white/[0.06] rounded-xl p-1 w-fit">
        <button
          onClick={() => setTab('branding')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'branding' ? 'bg-glow-400/15 text-glow-400' : 'text-gray-400 hover:text-white'
          }`}
        >
          Branding
        </button>
        <button
          onClick={() => setTab('privacy')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'privacy' ? 'bg-glow-400/15 text-glow-400' : 'text-gray-400 hover:text-white'
          }`}
        >
          Address Rotation
        </button>
        <button
          onClick={() => { setTab('wallet'); refreshAggregateBalance() }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'wallet' ? 'bg-glow-400/15 text-glow-400' : 'text-gray-400 hover:text-white'
          }`}
        >
          Wallet
        </button>
      </div>

      <div className="space-y-6">
        {/* Branding tab */}
        {tab === 'branding' && (
          <div className="bg-surface-800/60 border border-white/[0.06] rounded-2xl p-5">
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Display Name</label>
                <input
                  type="text"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder="e.g. Acme Electronics"
                  className="w-full px-3 py-2 bg-surface-700 border border-white/[0.06] rounded-lg text-sm focus:outline-none focus:border-glow-400 transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Brand Color</label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={brandColor}
                      onChange={(e) => setBrandColor(e.target.value)}
                      placeholder="#a855f7"
                      maxLength={7}
                      className="flex-1 min-w-0 px-3 py-2 bg-surface-700 border border-white/[0.06] rounded-lg text-sm focus:outline-none focus:border-glow-400 transition-colors font-mono"
                    />
                    <label
                      className="w-9 h-9 rounded-lg border border-white/[0.06] flex-shrink-0 cursor-pointer overflow-hidden relative"
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
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Background Color</label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={brandBackground}
                      onChange={(e) => setBrandBackground(e.target.value)}
                      placeholder="#0a0a0f"
                      maxLength={7}
                      className="flex-1 min-w-0 px-3 py-2 bg-surface-700 border border-white/[0.06] rounded-lg text-sm focus:outline-none focus:border-glow-400 transition-colors font-mono"
                    />
                    <label
                      className="w-9 h-9 rounded-lg border border-white/[0.06] flex-shrink-0 cursor-pointer overflow-hidden relative"
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
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Logo URL</label>
                <div className="flex gap-2 items-center">
                  <input
                    type="url"
                    value={logoUrl}
                    onChange={(e) => { setLogoUrl(e.target.value); setLogoError(false) }}
                    placeholder="https://example.com/logo.png"
                    className="flex-1 px-3 py-2 bg-surface-700 border border-white/[0.06] rounded-lg text-sm focus:outline-none focus:border-glow-400 transition-colors"
                  />
                  {logoUrl && !logoError && (
                    <div className="w-9 h-9 rounded-lg border border-white/[0.06] flex-shrink-0 overflow-hidden bg-surface-700 flex items-center justify-center">
                      <img src={logoUrl} alt="" crossOrigin="anonymous" className="w-full h-full object-contain" onError={() => setLogoError(true)} />
                    </div>
                  )}
                  {logoUrl && logoError && (
                    <div className="w-9 h-9 rounded-lg border border-red-500/30 flex-shrink-0 bg-red-500/10 flex items-center justify-center">
                      <span className="text-red-400 text-xs">!</span>
                    </div>
                  )}
                </div>
                {logoError && <p className="text-xs text-red-400 mt-1">Image failed to load — the server may not allow cross-origin requests.</p>}
              </div>
            </div>
          </div>
        )}

        {/* Privacy tab */}
        {tab === 'privacy' && (
          <div className="bg-surface-800/60 border border-white/[0.06] rounded-2xl p-6">
            <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5 text-glow-400" />
              Privacy & Address Rotation
            </h2>
            <p className="text-gray-400 text-sm mb-4">
              Incoming payments are distributed across multiple addresses to enhance transaction privacy. A higher count provides stronger privacy but spreads your balance across more accounts.
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
        )}

        {/* Wallet tab */}
        {tab === 'wallet' && (
          <div className="bg-surface-800/60 border border-white/[0.06] rounded-2xl p-6">
            <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
              <Wallet className="w-5 h-5 text-glow-400" />
              Sweep All Funds
            </h2>
            <p className="text-gray-400 text-sm mb-4">
              Send all funds from all accounts to a single Lightning address.
            </p>

            {/* Balance breakdown */}
            {aggregateBalance && (
              <div className="mb-4 bg-surface-700/50 rounded-xl p-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-gray-400">Total balance</span>
                  <span className="text-sm font-bold">{aggregateBalance.totalBalanceSats.toLocaleString()} sats</span>
                </div>
                <div className="space-y-1">
                  {aggregateBalance.perWallet.filter(w => w.balanceSats > 0).map(w => (
                    <div key={w.accountNumber} className="flex justify-between text-xs text-gray-500">
                      <span>Account {w.accountNumber}{w.address ? ` (${w.address.split('@')[0]})` : ''}</span>
                      <span>{w.balanceSats.toLocaleString()} sats</span>
                    </div>
                  ))}
                  {aggregateBalance.perWallet.every(w => w.balanceSats === 0) && (
                    <p className="text-xs text-gray-500">No funds in any account.</p>
                  )}
                </div>
              </div>
            )}

            {/* Destination input */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-400 mb-1">Destination Lightning Address</label>
              <input
                type="text"
                value={sweepDestination}
                onChange={(e) => { setSweepDestination(e.target.value); setSweepError(null); setSweepResults(null) }}
                placeholder="you@wallet.com"
                disabled={sweeping}
                className="w-full px-3 py-2 bg-surface-700 border border-white/[0.06] rounded-lg text-sm focus:outline-none focus:border-glow-400 transition-colors"
              />
            </div>

            {/* Sweep error */}
            {sweepError && (
              <div className="mb-4 bg-red-500/20 border border-red-500/30 rounded-xl p-3 text-sm text-red-400">
                {sweepError}
              </div>
            )}

            {/* Sweep progress */}
            {sweeping && (
              <div className="mb-4 flex items-center gap-2 text-sm text-gray-300">
                <Loader2 className="w-4 h-4 animate-spin text-glow-400" />
                {sweepProgress || 'Starting sweep...'}
              </div>
            )}

            {/* Sweep results */}
            {sweepResults && (
              <div className="mb-4 bg-surface-700/50 rounded-xl p-3 space-y-1.5">
                {sweepResults.map(r => (
                  <div key={r.accountNumber} className="flex items-center gap-2 text-sm">
                    {r.success
                      ? <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
                      : <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                    }
                    <span className={r.success ? 'text-green-400' : 'text-red-400'}>
                      Account {r.accountNumber}: {r.balanceSats.toLocaleString()} sats
                      {r.success ? ' sent' : ` — ${r.error}`}
                    </span>
                  </div>
                ))}
                <div className="pt-1.5 border-t border-white/[0.06] text-sm font-medium">
                  {sweepResults.every(r => r.success)
                    ? <span className="text-green-400">All funds swept successfully.</span>
                    : <span className="text-yellow-400">Some transfers failed. You can retry.</span>
                  }
                </div>
              </div>
            )}

            {/* Confirmation */}
            {showConfirm && !sweeping && (
              <div className="mb-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3">
                <p className="text-sm text-yellow-400 mb-3">
                  Send <span className="font-bold">{aggregateBalance?.totalBalanceSats.toLocaleString()} sats</span> to{' '}
                  <span className="font-mono">{sweepDestination}</span>?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowConfirm(false)}
                    className="px-3 py-1.5 bg-surface-700 hover:bg-surface-600 text-gray-300 rounded-lg text-sm transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      setShowConfirm(false)
                      setSweeping(true)
                      setSweepResults(null)
                      setSweepError(null)
                      try {
                        const results = await sweepFunds(sweepDestination, setSweepProgress)
                        setSweepResults(results)
                      } catch (err) {
                        setSweepError(err instanceof Error ? err.message : 'Sweep failed')
                      } finally {
                        setSweeping(false)
                        setSweepProgress('')
                      }
                    }}
                    className="px-3 py-1.5 bg-red-500 hover:bg-red-400 text-white font-semibold rounded-lg text-sm transition-colors"
                  >
                    Confirm Sweep
                  </button>
                </div>
              </div>
            )}

            {/* Sweep button */}
            {!showConfirm && !sweeping && (
              <button
                onClick={() => {
                  setSweepError(null)
                  setSweepResults(null)
                  if (!sweepDestination.trim()) {
                    setSweepError('Enter a destination Lightning address')
                    return
                  }
                  if (!aggregateBalance || aggregateBalance.totalBalanceSats === 0) {
                    setSweepError('No funds to sweep')
                    return
                  }
                  setShowConfirm(true)
                }}
                disabled={!sweepDestination.trim() || !aggregateBalance || aggregateBalance.totalBalanceSats === 0}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-500/80 hover:bg-red-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors text-sm"
              >
                <ArrowUpRight className="w-4 h-4" />
                Sweep All Funds
              </button>
            )}
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
            Your changes have been saved.
          </div>
        )}

        {/* Save button (branding & privacy tabs only) */}
        {tab !== 'wallet' && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-glow-400 hover:bg-glow-300 active:bg-glow-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-surface-900 font-bold rounded-xl transition-colors text-sm"
          >
            {saving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Changes
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}
