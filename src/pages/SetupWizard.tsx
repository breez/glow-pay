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

  // Redirect to dashboard if already set up
  useEffect(() => {
    const merchant = getMerchant()
    if (merchant) {
      navigate('/dashboard')
    }
  }, [navigate])

  // Generate mnemonic when entering generate step
  useEffect(() => {
    if (step === 'generate' && !mnemonic) {
      setMnemonic(generateMnemonic())
    }
  }, [step, mnemonic, generateMnemonic])

  const handleCopy = async () => {
    await navigator.clipboard.writeText(mnemonic)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleCreateWallet = async () => {
    setCreateError(null)
    setProgress('Initializing wallet...')
    try {
      await createWallet(mnemonic)

      // Expand to 10 wallets (accounts 0-9)
      setProgress('Setting up payment accounts...')
      await expandWalletPool(10)

      // Register random addresses on all 10 accounts
      setProgress('Generating addresses...')
      const allAddresses: string[] = []
      for (let i = 0; i < 10; i++) {
        const addr = await registerRandomAddressForAccount(i)
        allAddresses.push(addr)
        setProgress(`Generating addresses... (${i + 1}/10)`)
      }

      setProgress('Finalizing setup...')
      await refreshLightningAddress()

      // Derive deterministic merchant ID from mnemonic
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
      setCreateError(err instanceof Error ? err.message : 'Failed to create wallet')
    }
  }

  const handleRestore = async () => {
    const trimmed = restoreMnemonic.trim().toLowerCase().replace(/\s+/g, ' ')
    if (!trimmed || trimmed.split(' ').length !== 12) {
      setCreateError('Please enter a valid 12-word recovery phrase.')
      return
    }

    setCreateError(null)
    setProgress('Connecting wallet...')
    try {
      await restoreWallet(trimmed)

      setProgress('Setting up payment accounts...')
      await expandWalletPool(10)

      setProgress('Refreshing addresses...')
      await refreshLightningAddress()

      // Derive IDs from mnemonic
      const merchantId = await deriveMerchantId(trimmed)
      const authToken = await deriveAuthToken(trimmed)

      // Try to restore config from server
      setProgress('Restoring account data...')
      const result = await restoreMerchantFromServer(merchantId, authToken)

      if (result.success && result.data) {
        // Restore from server — rebuild Merchant type from server data
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
        // No server data — create fresh merchant config with this mnemonic's ID
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
      setCreateError(err instanceof Error ? err.message : 'Failed to restore wallet')
    }
  }

  const words = mnemonic.split(' ')

  const stepIndex = step === 'choose' ? 0 : step === 'complete' ? 2 : 1

  return (
    <div className="min-h-screen gradient-bg">
      {/* Header */}
      <header className="border-b border-white/[0.06]">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-glow-400 flex items-center justify-center shadow-lg shadow-glow-400/20">
            <Zap className="w-5 h-5 text-surface-900" />
          </div>
          <span className="text-xl font-bold">Glow Pay</span>
          <span className="text-gray-500">·</span>
          <span className="text-gray-400">Setup</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-12">
        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === stepIndex ? 'bg-glow-400 w-8' :
                i < stepIndex ? 'bg-glow-400/50 w-2' : 'bg-white/20 w-2'
              }`}
            />
          ))}
        </div>

        {/* Error display */}
        {walletError && (
          <div className="mb-6 bg-red-500/20 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-red-400">{walletError}</p>
              <button onClick={clearError} className="text-sm text-red-400/70 hover:text-red-400 mt-1">
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Step: Choose — new or restore */}
        {step === 'choose' && (
          <div>
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-2xl bg-glow-400/20 flex items-center justify-center mx-auto mb-4">
                <Zap className="w-8 h-8 text-glow-400" />
              </div>
              <h1 className="text-3xl font-bold mb-2">Welcome to Glow Pay</h1>
              <p className="text-gray-400">
                Create a new wallet or restore an existing one.
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => setStep('generate')}
                className="w-full flex items-center gap-4 p-5 bg-surface-800/60 border border-white/[0.06] rounded-2xl hover:bg-surface-700/60 transition-colors text-left"
              >
                <div className="w-12 h-12 rounded-xl bg-glow-400/20 flex items-center justify-center shrink-0">
                  <Key className="w-6 h-6 text-glow-400" />
                </div>
                <div>
                  <p className="font-semibold mb-0.5">Create New Wallet</p>
                  <p className="text-sm text-gray-400">Generate a new recovery phrase and set up your account.</p>
                </div>
                <ArrowRight className="w-5 h-5 text-gray-500 shrink-0 ml-auto" />
              </button>

              <button
                onClick={() => setStep('restore')}
                className="w-full flex items-center gap-4 p-5 bg-surface-800/60 border border-white/[0.06] rounded-2xl hover:bg-surface-700/60 transition-colors text-left"
              >
                <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center shrink-0">
                  <RotateCcw className="w-6 h-6 text-blue-400" />
                </div>
                <div>
                  <p className="font-semibold mb-0.5">Restore Existing Wallet</p>
                  <p className="text-sm text-gray-400">Use your 12-word recovery phrase to restore your account.</p>
                </div>
                <ArrowRight className="w-5 h-5 text-gray-500 shrink-0 ml-auto" />
              </button>
            </div>
          </div>
        )}

        {/* Step: Generate Mnemonic */}
        {step === 'generate' && (
          <div>
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-glow-400/20 flex items-center justify-center mx-auto mb-4">
                <Key className="w-8 h-8 text-glow-400" />
              </div>
              <h1 className="text-3xl font-bold mb-2">Save Your Recovery Phrase</h1>
              <p className="text-gray-400">
                Write down these 12 words in order and store them securely. This is the only way to recover your wallet.
              </p>
            </div>

            {/* Mnemonic grid */}
            <div className="bg-surface-800/50 border border-white/[0.06] rounded-2xl p-6 mb-6">
              <div className="grid grid-cols-3 gap-3">
                {words.map((word, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 bg-surface-700 rounded-lg px-3 py-2"
                  >
                    <span className="text-gray-500 text-sm font-mono tabular-nums w-5 text-right">
                      {index + 1}.
                    </span>
                    <span className="font-mono font-medium">{word}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Copy button */}
            <div className="flex justify-center mb-6">
              <button
                onClick={handleCopy}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                  copied
                    ? 'bg-green-500/20 text-green-400'
                    : 'text-glow-400 hover:bg-glow-400/10'
                }`}
              >
                {copied ? (
                  <>
                    <Check className="w-5 h-5" />
                    <span className="font-medium">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-5 h-5" />
                    <span className="font-medium">Copy to clipboard</span>
                  </>
                )}
              </button>
            </div>

            {/* Warning */}
            <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 mb-8">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center flex-shrink-0">
                  <Shield className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <h3 className="font-bold text-red-400 mb-1">Important</h3>
                  <p className="text-gray-400 text-sm">
                    Never share your recovery phrase. Anyone with these words can access your funds. Glow Pay cannot recover it for you.
                  </p>
                </div>
              </div>
            </div>

            {/* Confirm checkbox */}
            <label className="flex items-start gap-3 mb-6 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-1 w-5 h-5 rounded border-white/20 bg-surface-700 accent-glow-400 focus:ring-glow-400 focus:ring-offset-0"
              />
              <span className="text-gray-300">
                I have saved my recovery phrase in a secure location and understand it cannot be recovered if lost.
              </span>
            </label>

            {/* Error display */}
            {createError && (
              <div className="mb-6 bg-red-500/20 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-red-400">{createError}</p>
                </div>
              </div>
            )}

            <button
              onClick={handleCreateWallet}
              disabled={!confirmed || isConnecting}
              className="w-full flex flex-col items-center justify-center gap-1 px-6 py-4 bg-glow-400 hover:bg-glow-300 active:scale-[0.98] disabled:bg-gray-600 disabled:cursor-not-allowed text-surface-900 font-bold rounded-xl transition-all"
            >
              {isConnecting ? (
                <>
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Setting up your account...
                  </span>
                  {progress && (
                    <span className="text-xs font-medium opacity-70">{progress}</span>
                  )}
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
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-blue-500/20 flex items-center justify-center mx-auto mb-4">
                <RotateCcw className="w-8 h-8 text-blue-400" />
              </div>
              <h1 className="text-3xl font-bold mb-2">Restore Your Wallet</h1>
              <p className="text-gray-400">
                Enter your 12-word recovery phrase to restore your wallet and account settings.
              </p>
            </div>

            <div className="mb-6">
              <textarea
                value={restoreMnemonic}
                onChange={(e) => setRestoreMnemonic(e.target.value)}
                placeholder="Enter your 12-word recovery phrase, separated by spaces..."
                rows={3}
                className="w-full px-4 py-3 bg-surface-700 border border-white/[0.06] rounded-xl focus:outline-none focus:border-glow-400 transition-colors font-mono text-sm resize-none"
                autoFocus
              />
              <p className="text-xs text-gray-500 mt-2">
                Your recovery phrase will restore both your wallet and your merchant settings (API keys, branding, webhooks).
              </p>
            </div>

            {/* Error display */}
            {createError && (
              <div className="mb-6 bg-red-500/20 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-red-400">{createError}</p>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setStep('choose'); setCreateError(null); setRestoreMnemonic('') }}
                className="px-6 py-4 bg-surface-700 hover:bg-surface-600 text-gray-300 font-semibold rounded-xl transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleRestore}
                disabled={!restoreMnemonic.trim() || isConnecting}
                className="flex-1 flex flex-col items-center justify-center gap-1 px-6 py-4 bg-glow-400 hover:bg-glow-300 active:scale-[0.98] disabled:bg-gray-600 disabled:cursor-not-allowed text-surface-900 font-bold rounded-xl transition-all"
              >
                {isConnecting ? (
                  <>
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Restoring...
                    </span>
                    {progress && (
                      <span className="text-xs font-medium opacity-70">{progress}</span>
                    )}
                  </>
                ) : (
                  'Restore Wallet'
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step: Complete */}
        {step === 'complete' && (
          <div className="text-center">
            <div className="w-20 h-20 rounded-full bg-glow-400/20 flex items-center justify-center mx-auto mb-6 animate-bounce-in">
              <Check className="w-10 h-10 text-glow-400" />
            </div>
            <h1 className="text-4xl font-bold mb-4">Setup Complete</h1>
            <p className="text-xl text-gray-400 mb-8 max-w-md mx-auto">
              Your account is ready. You can now create payment links and start receiving funds.
            </p>

            <button
              onClick={() => navigate('/dashboard')}
              className="inline-flex items-center gap-2 px-8 py-4 bg-glow-400 hover:bg-glow-300 active:scale-[0.98] text-surface-900 font-bold rounded-xl text-lg transition-all glow-box"
            >
              Open Dashboard
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
