import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Zap, Copy, Check, ArrowRight, ArrowLeft, Shield, Key, User, Loader2, AlertCircle } from 'lucide-react'
import { useWallet } from '@/lib/wallet/WalletContext'
import { getMerchant, saveMerchant, generateId, generateApiKey, generateSecret } from '@/lib/store'
import { syncMerchantToServer } from '@/lib/api-client'
import type { Merchant } from '@/lib/types'

type Step = 'welcome' | 'generate' | 'username' | 'store' | 'complete'

export function SetupWizard() {
  const navigate = useNavigate()
  const {
    isConnecting,
    lightningAddress,
    generateMnemonic,
    createWallet,
    checkUsernameAvailable,
    setLightningUsername,
    refreshLightningAddress,
    registerAllAddresses,
    allLightningAddresses,
    error: walletError,
    clearError,
  } = useWallet()

  const [step, setStep] = useState<Step>('welcome')
  const [mnemonic, setMnemonic] = useState('')
  const [copied, setCopied] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  
  // Username step
  const [username, setUsername] = useState('')
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null)
  const [checkingUsername, setCheckingUsername] = useState(false)
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [settingUsername, setSettingUsername] = useState(false)
  
  // Privacy address registration
  const [registrationProgress, setRegistrationProgress] = useState(0)
  const [registeredAddresses, setRegisteredAddresses] = useState<string[]>([])

  // Store step
  const [storeName, setStoreName] = useState('')
  const [redirectUrl, setRedirectUrl] = useState('')
  const [saving, setSaving] = useState(false)

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

  // Check username availability with debounce
  useEffect(() => {
    if (!username || username.length < 3) {
      setUsernameAvailable(null)
      setUsernameError(null)
      return
    }

    const timer = setTimeout(async () => {
      setCheckingUsername(true)
      setUsernameError(null)
      try {
        const available = await checkUsernameAvailable(username)
        setUsernameAvailable(available)
        if (!available) {
          setUsernameError('Username is already taken')
        }
      } catch {
        setUsernameError('Failed to check availability')
      } finally {
        setCheckingUsername(false)
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [username, checkUsernameAvailable])

  const handleCopy = async () => {
    await navigator.clipboard.writeText(mnemonic)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const [createError, setCreateError] = useState<string | null>(null)
  
  const handleCreateWallet = async () => {
    setCreateError(null)
    try {
      await createWallet(mnemonic)
      await refreshLightningAddress()
      setStep('username')
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create wallet')
    }
  }

  const handleSetUsername = async () => {
    if (!username || !usernameAvailable) return

    setSettingUsername(true)
    setRegistrationProgress(0)
    try {
      // Register primary address first
      await setLightningUsername(username)
      setRegistrationProgress(1)

      // Register rotation addresses (accounts 1-4)
      const addresses = await registerAllAddresses(username)
      setRegisteredAddresses(addresses)
      setRegistrationProgress(5)

      setStep('store')
    } catch (err) {
      setUsernameError(err instanceof Error ? err.message : 'Failed to register addresses')
    } finally {
      setSettingUsername(false)
    }
  }

  const handleSaveStore = async () => {
    if (!lightningAddress?.lightningAddress) return

    setSaving(true)
    try {
      const addresses = registeredAddresses.length > 0
        ? registeredAddresses
        : allLightningAddresses.length > 0
          ? allLightningAddresses
          : [lightningAddress.lightningAddress]

      const merchant: Merchant = {
        id: generateId(),
        lightningAddress: lightningAddress.lightningAddress,
        lightningAddresses: addresses,
        storeName: storeName || '',
        redirectUrl: redirectUrl || null,
        redirectSecret: generateSecret(),
        apiKey: generateApiKey(),
        createdAt: new Date().toISOString(),
      }
      saveMerchant(merchant)

      // Sync to server for API access
      syncMerchantToServer({
        merchantId: merchant.id,
        apiKey: merchant.apiKey,
        storeName: merchant.storeName,
        lightningAddresses: merchant.lightningAddresses,
        redirectUrl: merchant.redirectUrl,
      }).catch(err => console.warn('Failed to sync merchant to server:', err))

      setStep('complete')
    } finally {
      setSaving(false)
    }
  }

  const words = mnemonic.split(' ')

  return (
    <div className="min-h-screen gradient-bg">
      {/* Header */}
      <header className="border-b border-white/10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-glow-400 flex items-center justify-center">
            <Zap className="w-5 h-5 text-surface-900" />
          </div>
          <span className="text-xl font-bold">Glow Pay</span>
          <span className="text-gray-500">•</span>
          <span className="text-gray-400">Setup Wizard</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-12">
        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-2 mb-12">
          {['welcome', 'generate', 'username', 'store', 'complete'].map((s, i) => (
            <div
              key={s}
              className={`w-2 h-2 rounded-full transition-colors ${
                s === step ? 'bg-glow-400 w-8' : 
                ['welcome', 'generate', 'username', 'store', 'complete'].indexOf(step) > i 
                  ? 'bg-glow-400/50' : 'bg-white/20'
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

        {/* Step: Welcome */}
        {step === 'welcome' && (
          <div className="text-center">
            <div className="w-20 h-20 rounded-2xl bg-glow-400/20 flex items-center justify-center mx-auto mb-6">
              <Zap className="w-10 h-10 text-glow-400" />
            </div>
            <h1 className="text-4xl font-bold mb-4">Welcome to Glow Pay</h1>
            <p className="text-xl text-gray-400 mb-8 max-w-md mx-auto">
              Let's set up your non-custodial Lightning wallet to start accepting Bitcoin payments.
            </p>
            
            <div className="grid gap-4 max-w-sm mx-auto mb-8">
              <div className="flex items-center gap-4 text-left bg-surface-800/50 rounded-xl p-4">
                <div className="w-10 h-10 rounded-lg bg-glow-400/20 flex items-center justify-center flex-shrink-0">
                  <Key className="w-5 h-5 text-glow-400" />
                </div>
                <div>
                  <h3 className="font-semibold">Create Wallet</h3>
                  <p className="text-sm text-gray-400">Generate your secure recovery phrase</p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-left bg-surface-800/50 rounded-xl p-4">
                <div className="w-10 h-10 rounded-lg bg-glow-400/20 flex items-center justify-center flex-shrink-0">
                  <User className="w-5 h-5 text-glow-400" />
                </div>
                <div>
                  <h3 className="font-semibold">Choose Username</h3>
                  <p className="text-sm text-gray-400">Get your @breez.cash Lightning address</p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-left bg-surface-800/50 rounded-xl p-4">
                <div className="w-10 h-10 rounded-lg bg-glow-400/20 flex items-center justify-center flex-shrink-0">
                  <Shield className="w-5 h-5 text-glow-400" />
                </div>
                <div>
                  <h3 className="font-semibold">Start Accepting Payments</h3>
                  <p className="text-sm text-gray-400">Non-custodial, instant settlements</p>
                </div>
              </div>
            </div>

            <button
              onClick={() => setStep('generate')}
              className="inline-flex items-center gap-2 px-8 py-4 bg-glow-400 hover:bg-glow-300 text-surface-900 font-bold rounded-xl text-lg transition-all hover:scale-105 glow-box"
            >
              Create New Wallet
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Step: Generate Mnemonic */}
        {step === 'generate' && (
          <div>
            <button
              onClick={() => setStep('welcome')}
              className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>

            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-2xl bg-glow-400/20 flex items-center justify-center mx-auto mb-4">
                <Key className="w-8 h-8 text-glow-400" />
              </div>
              <h1 className="text-3xl font-bold mb-2">Your Recovery Phrase</h1>
              <p className="text-gray-400">
                Write down these 12 words in order. This is your only backup to recover your wallet.
              </p>
            </div>

            {/* Mnemonic grid */}
            <div className="bg-surface-800/50 border border-white/10 rounded-2xl p-6 mb-6">
              <div className="grid grid-cols-3 gap-3">
                {words.map((word, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 bg-surface-700 rounded-lg px-3 py-2"
                  >
                    <span className="text-gray-500 text-sm font-mono w-5 text-right">
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
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 mb-8">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                  <Shield className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="font-bold text-amber-400 mb-1">Keep it Secret</h3>
                  <p className="text-gray-400 text-sm">
                    Never share your recovery phrase. Anyone with these words can access your funds.
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
                I have securely saved my recovery phrase and understand that losing it means losing access to my funds.
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
              className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-glow-400 hover:bg-glow-300 disabled:bg-gray-600 disabled:cursor-not-allowed text-surface-900 font-bold rounded-xl transition-colors"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Creating Wallet...
                </>
              ) : (
                <>
                  Continue
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </div>
        )}

        {/* Step: Choose Username */}
        {step === 'username' && (
          <div>
            <button
              onClick={() => setStep('generate')}
              className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>

            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-2xl bg-glow-400/20 flex items-center justify-center mx-auto mb-4">
                <User className="w-8 h-8 text-glow-400" />
              </div>
              <h1 className="text-3xl font-bold mb-2">Choose Your Username</h1>
              <p className="text-gray-400">
                This will be your Lightning address for receiving payments.
              </p>
            </div>

            <div className="bg-surface-800/50 border border-white/10 rounded-2xl p-6 mb-6">
              <label className="block text-sm text-gray-400 mb-2">Lightning Address</label>
              <div className="flex">
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                  placeholder="yourname"
                  className="flex-1 px-4 py-3 bg-surface-700 border border-white/10 border-r-0 rounded-l-xl focus:outline-none focus:border-glow-400 focus:z-10 transition-colors font-mono"
                />
                <div className="px-4 py-3 bg-surface-900 border border-white/10 rounded-r-xl text-gray-400 font-medium flex items-center">
                  @breez.cash
                </div>
              </div>
              
              {/* Availability indicator */}
              <div className="mt-3 h-6">
                {checkingUsername && (
                  <div className="flex items-center gap-2 text-gray-400 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Checking availability...
                  </div>
                )}
                {!checkingUsername && usernameAvailable === true && username.length >= 3 && (
                  <div className="flex items-center gap-2 text-green-400 text-sm">
                    <Check className="w-4 h-4" />
                    {username}@breez.cash is available!
                  </div>
                )}
                {!checkingUsername && usernameError && (
                  <div className="flex items-center gap-2 text-red-400 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    {usernameError}
                  </div>
                )}
                {!checkingUsername && username.length > 0 && username.length < 3 && (
                  <div className="text-gray-500 text-sm">
                    Username must be at least 3 characters
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={handleSetUsername}
              disabled={!usernameAvailable || settingUsername || username.length < 3}
              className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-glow-400 hover:bg-glow-300 disabled:bg-gray-600 disabled:cursor-not-allowed text-surface-900 font-bold rounded-xl transition-colors"
            >
              {settingUsername ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {registrationProgress > 0
                    ? `Setting up privacy addresses... (${registrationProgress}/5)`
                    : 'Registering...'}
                </>
              ) : (
                <>
                  Continue
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </div>
        )}

        {/* Step: Store Info */}
        {step === 'store' && (
          <div>
            <button
              onClick={() => setStep('username')}
              className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>

            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-2xl bg-glow-400/20 flex items-center justify-center mx-auto mb-4">
                <Shield className="w-8 h-8 text-glow-400" />
              </div>
              <h1 className="text-3xl font-bold mb-2">Store Information</h1>
              <p className="text-gray-400">
                Optional details about your store (you can change these later).
              </p>
            </div>

            {/* Lightning address display */}
            {lightningAddress && (
              <div className="bg-glow-400/10 border border-glow-400/30 rounded-2xl p-4 mb-6">
                <div className="flex items-center gap-3">
                  <Zap className="w-5 h-5 text-glow-400" />
                  <div>
                    <p className="text-sm text-gray-400">Your Lightning Address</p>
                    <p className="font-mono font-bold text-glow-400">
                      {lightningAddress.lightningAddress}
                    </p>
                    {registeredAddresses.length > 1 && (
                      <p className="text-xs text-gray-500 mt-1">
                        + {registeredAddresses.length - 1} privacy rotation addresses
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-4 mb-8">
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
                  After successful payment, customers will be redirected here with payment details.
                </p>
              </div>
            </div>

            <button
              onClick={handleSaveStore}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-glow-400 hover:bg-glow-300 disabled:bg-gray-600 disabled:cursor-not-allowed text-surface-900 font-bold rounded-xl transition-colors"
            >
              {saving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  Complete Setup
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </div>
        )}

        {/* Step: Complete */}
        {step === 'complete' && (
          <div className="text-center">
            <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6">
              <Check className="w-10 h-10 text-green-400" />
            </div>
            <h1 className="text-4xl font-bold mb-4">You're All Set!</h1>
            <p className="text-xl text-gray-400 mb-8 max-w-md mx-auto">
              Your wallet is ready. Start accepting Bitcoin payments instantly.
            </p>

            {lightningAddress && (
              <div className="bg-surface-800/50 border border-white/10 rounded-2xl p-6 mb-8 max-w-sm mx-auto">
                <p className="text-sm text-gray-400 mb-2">Your Lightning Address</p>
                <p className="font-mono text-xl font-bold text-glow-400">
                  {lightningAddress.lightningAddress}
                </p>
                {registeredAddresses.length > 1 && (
                  <p className="text-sm text-gray-500 mt-2">
                    + {registeredAddresses.length - 1} privacy rotation addresses for enhanced security
                  </p>
                )}
              </div>
            )}

            <button
              onClick={() => navigate('/dashboard')}
              className="inline-flex items-center gap-2 px-8 py-4 bg-glow-400 hover:bg-glow-300 text-surface-900 font-bold rounded-xl text-lg transition-all hover:scale-105 glow-box"
            >
              Go to Dashboard
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
