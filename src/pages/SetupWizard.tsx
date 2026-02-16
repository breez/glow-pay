import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Zap, Copy, Check, ArrowRight, Shield, Key, Loader2, AlertCircle, RotateCcw } from 'lucide-react'
import { useWallet } from '@/lib/wallet/WalletContext'
import { getMerchant, saveMerchant, generateApiKey, generateSecret } from '@/lib/store'
import { syncMerchantToServer, restoreMerchantFromServer } from '@/lib/api-client'
import { registerRandomAddressForAccount, expandWalletPool } from '@/lib/wallet/walletService'
import { deriveMerchantId, deriveAuthToken } from '@/lib/auth'
import type { Merchant } from '@/lib/types'

type Step = 'choose' | 'generate' | 'restore' | 'complete'

export function SetupWizard() {
  const navigate = useNavigate()
  const {
    isConnecting,
    generateMnemonic,
    createWallet,
    restoreWallet,
    refreshLightningAddress,
    error: walletError,
    clearError,
  } = useWallet()

  const [step, setStep] = useState<Step>('choose')
  const [mnemonic, setMnemonic] = useState('')
  const [restoreMnemonic, setRestoreMnemonic] = useState('')
  const [copied, setCopied] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [progress, setProgress] = useState('')

  useEffect(() => {
    const merchant = getMerchant()
    if (merchant) navigate('/dashboard')
  }, [navigate])

  useEffect(() => {
    if (step === 'generate' && !mnemonic) setMnemonic(generateMnemonic())
  }, [step, mnemonic, generateMnemonic])

  const handleCopy = async () => {
    await navigator.clipboard.writeText(mnemonic)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleCreateWallet = async () => {
    setCreateError(null)
    setProgress('Initializing account...')
    try {
      await createWallet(mnemonic)

      setProgress('Setting up payment accounts...')
      await expandWalletPool(10)

      setProgress('Generating addresses...')
      const allAddresses: string[] = []
      for (let i = 0; i < 10; i++) {
        const addr = await registerRandomAddressForAccount(i)
        allAddresses.push(addr)
        setProgress(`Generating addresses... (${i + 1}/10)`)
      }

      setProgress('Finalizing setup...')
      await refreshLightningAddress()

      const merchantId = await deriveMerchantId(mnemonic)
      const initialApiKey = generateApiKey()
      const now = new Date().toISOString()

      const merchant: Merchant = {
        id: merchantId,
        lightningAddress: allAddresses[0],
        lightningAddresses: allAddresses,
        storeName: '',
        redirectUrl: null,
        redirectSecret: generateSecret(),
        apiKey: initialApiKey,
        apiKeys: [{ key: initialApiKey, label: 'Default', createdAt: now, active: true }],
        rotationEnabled: true,
        rotationCount: 1,
        createdAt: now,
      }
      saveMerchant(merchant)

      try {
        await syncMerchantToServer({
          merchantId: merchant.id,
          apiKey: merchant.apiKey,
          apiKeys: merchant.apiKeys,
          storeName: merchant.storeName,
          lightningAddresses: merchant.lightningAddresses,
          redirectUrl: merchant.redirectUrl,
          rotationEnabled: merchant.rotationEnabled,
          rotationCount: merchant.rotationCount,
        })
      } catch (err) {
        console.warn('Failed to sync merchant to server:', err)
      }

      setStep('complete')
    } catch (err) {
      setProgress('')
      setCreateError(err instanceof Error ? err.message : 'Failed to create account')
    }
  }

  const handleRestore = async () => {
    const trimmed = restoreMnemonic.trim().toLowerCase().replace(/\s+/g, ' ')
    if (!trimmed || trimmed.split(' ').length !== 12) {
      setCreateError('Please enter a valid 12-word recovery phrase.')
      return
    }

    setCreateError(null)
    setProgress('Connecting account...')
    try {
      await restoreWallet(trimmed)

      setProgress('Setting up payment accounts...')
      await expandWalletPool(10)

      setProgress('Refreshing addresses...')
      await refreshLightningAddress()

      const merchantId = await deriveMerchantId(trimmed)
      const authToken = await deriveAuthToken(trimmed)

      setProgress('Restoring account data...')
      const result = await restoreMerchantFromServer(merchantId, authToken)

      if (result.success && result.data) {
        const data = result.data
        const merchant: Merchant = {
          id: data.id,
          lightningAddress: data.lightningAddresses[0] || '',
          lightningAddresses: data.lightningAddresses,
          storeName: data.storeName,
          redirectUrl: data.redirectUrl,
          redirectSecret: generateSecret(),
          apiKey: data.apiKey,
          apiKeys: data.apiKeys.map(k => ({
            key: k.key,
            label: k.label,
            createdAt: k.createdAt || data.registeredAt,
            active: k.active,
          })),
          rotationEnabled: data.rotationEnabled,
          rotationCount: data.rotationCount,
          webhookUrl: data.webhookUrl,
          webhookSecret: data.webhookSecret,
          brandColor: data.brandColor,
          brandBackground: data.brandBackground,
          logoUrl: data.logoUrl,
          createdAt: data.registeredAt,
        }
        saveMerchant(merchant)
      } else {
        setProgress('Creating fresh account...')

        const allAddresses: string[] = []
        for (let i = 0; i < 10; i++) {
          const addr = await registerRandomAddressForAccount(i)
          allAddresses.push(addr)
          setProgress(`Generating addresses... (${i + 1}/10)`)
        }

        const initialApiKey = generateApiKey()
        const now = new Date().toISOString()

        const merchant: Merchant = {
          id: merchantId,
          lightningAddress: allAddresses[0],
          lightningAddresses: allAddresses,
          storeName: '',
          redirectUrl: null,
          redirectSecret: generateSecret(),
          apiKey: initialApiKey,
          apiKeys: [{ key: initialApiKey, label: 'Default', createdAt: now, active: true }],
          rotationEnabled: true,
          rotationCount: 1,
          createdAt: now,
        }
        saveMerchant(merchant)

        try {
          await syncMerchantToServer({
            merchantId: merchant.id,
            apiKey: merchant.apiKey,
            apiKeys: merchant.apiKeys,
            storeName: merchant.storeName,
            lightningAddresses: merchant.lightningAddresses,
            redirectUrl: merchant.redirectUrl,
            rotationEnabled: merchant.rotationEnabled,
            rotationCount: merchant.rotationCount,
          })
        } catch (err) {
          console.warn('Failed to sync merchant to server:', err)
        }
      }

      setStep('complete')
    } catch (err) {
      setProgress('')
      setCreateError(err instanceof Error ? err.message : 'Failed to restore account')
    }
  }

  const words = mnemonic.split(' ')
  const stepIndex = step === 'choose' ? 0 : step === 'complete' ? 2 : 1

  return (
    <div className="min-h-screen gradient-bg">
      {/* Header */}
      <header className="border-b border-white/[0.06]">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-glow-400 flex items-center justify-center shadow-lg shadow-glow-400/20">
            <Zap className="w-4 h-4 text-surface-900" />
          </div>
          <span className="text-lg font-bold">Glow Pay</span>
          <span className="text-gray-600 text-sm ml-1">Setup</span>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-8">
        {/* Progress */}
        <div className="flex items-center justify-center gap-1.5 mb-6">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === stepIndex ? 'bg-glow-400 w-6' :
                i < stepIndex ? 'bg-glow-400/50 w-1.5' : 'bg-white/20 w-1.5'
              }`}
            />
          ))}
        </div>

        {/* Error display */}
        {walletError && (
          <div className="mb-4 bg-red-500/20 border border-red-500/30 rounded-xl p-3 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="text-red-400">{walletError}</p>
              <button onClick={clearError} className="text-xs text-red-400/70 hover:text-red-400 mt-1">Dismiss</button>
            </div>
          </div>
        )}

        {/* Step: Choose */}
        {step === 'choose' && (
          <div>
            <div className="text-center mb-6">
              <div className="w-12 h-12 rounded-xl bg-glow-400/20 flex items-center justify-center mx-auto mb-3">
                <Zap className="w-6 h-6 text-glow-400" />
              </div>
              <h1 className="text-2xl font-bold mb-1">Welcome to Glow Pay</h1>
              <p className="text-sm text-gray-400">Create a new account or restore an existing one.</p>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => setStep('generate')}
                className="w-full flex items-center gap-3 p-4 bg-surface-800/60 border border-white/[0.06] rounded-xl hover:bg-surface-700/60 transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-lg bg-glow-400/20 flex items-center justify-center shrink-0">
                  <Key className="w-5 h-5 text-glow-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">Create New Account</p>
                  <p className="text-xs text-gray-500">Generate a new recovery phrase.</p>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-600 shrink-0" />
              </button>

              <button
                onClick={() => setStep('restore')}
                className="w-full flex items-center gap-3 p-4 bg-surface-800/60 border border-white/[0.06] rounded-xl hover:bg-surface-700/60 transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0">
                  <RotateCcw className="w-5 h-5 text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">Restore Existing Account</p>
                  <p className="text-xs text-gray-500">Use your 12-word recovery phrase.</p>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-600 shrink-0" />
              </button>
            </div>
          </div>
        )}

        {/* Step: Generate Mnemonic */}
        {step === 'generate' && (
          <div>
            <div className="text-center mb-4">
              <h1 className="text-xl font-bold mb-1">Save Your Recovery Phrase</h1>
              <p className="text-sm text-gray-400">
                Write down these 12 words in order. This is the only way to recover your account.
              </p>
            </div>

            {/* Mnemonic grid */}
            <div className="bg-surface-800/50 border border-white/[0.06] rounded-xl p-4 mb-3">
              <div className="grid grid-cols-3 gap-2">
                {words.map((word, index) => (
                  <div key={index} className="flex items-center gap-1.5 bg-surface-700 rounded-lg px-2.5 py-1.5">
                    <span className="text-gray-600 text-xs font-mono tabular-nums w-4 text-right">{index + 1}.</span>
                    <span className="font-mono text-sm font-medium">{word}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Copy */}
            <div className="flex justify-center mb-3">
              <button
                onClick={handleCopy}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all ${
                  copied ? 'bg-green-500/20 text-green-400' : 'text-glow-400 hover:bg-glow-400/10'
                }`}
              >
                {copied ? <><Check className="w-4 h-4" /> Copied</> : <><Copy className="w-4 h-4" /> Copy</>}
              </button>
            </div>

            {/* Warning */}
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-4 flex items-start gap-2.5">
              <Shield className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-gray-400">
                <span className="text-red-400 font-semibold">Important:</span> Never share your recovery phrase. Anyone with these words can access your funds.
              </p>
            </div>

            {/* Confirm */}
            <label className="flex items-start gap-2.5 mb-4 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-white/20 bg-surface-700 accent-glow-400"
              />
              <span className="text-sm text-gray-300">
                I have saved my recovery phrase securely.
              </span>
            </label>

            {createError && (
              <div className="mb-4 bg-red-500/20 border border-red-500/30 rounded-xl p-3 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <p className="text-sm text-red-400">{createError}</p>
              </div>
            )}

            <button
              onClick={handleCreateWallet}
              disabled={!confirmed || isConnecting}
              className="w-full flex flex-col items-center justify-center gap-0.5 px-4 py-3 bg-glow-400 hover:bg-glow-300 active:scale-[0.98] disabled:bg-gray-600 disabled:cursor-not-allowed text-surface-900 font-bold rounded-xl transition-all text-sm"
            >
              {isConnecting ? (
                <>
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Setting up your account...
                  </span>
                  {progress && <span className="text-xs font-medium opacity-70">{progress}</span>}
                </>
              ) : (
                <>
                  Continue
                  <span className="text-xs font-medium opacity-70">This may take a moment</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Step: Restore */}
        {step === 'restore' && (
          <div>
            <div className="text-center mb-4">
              <h1 className="text-xl font-bold mb-1">Restore Your Account</h1>
              <p className="text-sm text-gray-400">
                Enter your 12-word recovery phrase to restore your account.
              </p>
            </div>

            <div className="mb-4">
              <textarea
                value={restoreMnemonic}
                onChange={(e) => setRestoreMnemonic(e.target.value)}
                placeholder="Enter your 12-word recovery phrase..."
                rows={3}
                className="w-full px-3 py-2.5 bg-surface-700 border border-white/[0.06] rounded-xl focus:outline-none focus:border-glow-400 transition-colors font-mono text-sm resize-none"
                autoFocus
              />
              <p className="text-xs text-gray-600 mt-1.5">
                Restores your account and all settings (API keys, branding, webhooks).
              </p>
            </div>

            {createError && (
              <div className="mb-4 bg-red-500/20 border border-red-500/30 rounded-xl p-3 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <p className="text-sm text-red-400">{createError}</p>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => { setStep('choose'); setCreateError(null); setRestoreMnemonic('') }}
                className="px-4 py-3 bg-surface-700 hover:bg-surface-600 text-gray-300 font-semibold rounded-xl transition-colors text-sm"
              >
                Back
              </button>
              <button
                onClick={handleRestore}
                disabled={!restoreMnemonic.trim() || isConnecting}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 px-4 py-3 bg-glow-400 hover:bg-glow-300 active:scale-[0.98] disabled:bg-gray-600 disabled:cursor-not-allowed text-surface-900 font-bold rounded-xl transition-all text-sm"
              >
                {isConnecting ? (
                  <>
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Restoring...
                    </span>
                    {progress && <span className="text-xs font-medium opacity-70">{progress}</span>}
                  </>
                ) : (
                  'Restore Account'
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step: Complete */}
        {step === 'complete' && (
          <div className="text-center pt-4">
            <div className="w-16 h-16 rounded-full bg-glow-400/20 flex items-center justify-center mx-auto mb-4 animate-bounce-in">
              <Check className="w-8 h-8 text-glow-400" />
            </div>
            <h1 className="text-2xl font-bold mb-2">You're all set</h1>
            <p className="text-sm text-gray-400 mb-6 max-w-xs mx-auto">
              Your account is ready. Create payment links and start receiving funds.
            </p>
            <button
              onClick={() => navigate('/dashboard')}
              className="inline-flex items-center gap-2 px-6 py-3 bg-glow-400 hover:bg-glow-300 active:scale-[0.98] text-surface-900 font-bold rounded-xl transition-all text-sm glow-box"
            >
              Open Dashboard
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
