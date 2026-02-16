import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Zap, Shield, Globe, ArrowRight } from 'lucide-react'
import { getMerchant } from '@/lib/store'

export function LandingPage() {
  const navigate = useNavigate()

  useEffect(() => {
    const merchant = getMerchant()
    if (merchant) navigate('/dashboard')
  }, [navigate])

  return (
    <div className="min-h-screen gradient-bg flex flex-col">
      {/* Header */}
      <header className="border-b border-white/[0.06]">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-glow-400 flex items-center justify-center shadow-lg shadow-glow-400/20">
            <Zap className="w-4 h-4 text-surface-900" />
          </div>
          <span className="text-lg font-bold">Glow Pay</span>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto px-4 py-8 w-full">
        {/* Hero */}
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-5xl font-bold mb-3">
            Accept Bitcoin <span className="text-glow-400 glow-text">in Seconds</span>
          </h1>
          <p className="text-base text-gray-400 max-w-lg mx-auto mb-5">
            Instant Lightning payments on your website. No middlemen, no monthly fees, no custody risk.
          </p>
          <Link
            to="/setup"
            className="inline-flex items-center gap-2 px-6 py-3 bg-glow-400 hover:bg-glow-300 active:scale-[0.98] text-surface-900 font-bold rounded-xl transition-all glow-box text-sm"
          >
            Get Started
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-3 mb-6">
          <div className="bg-surface-800/50 border border-white/[0.06] rounded-xl p-4">
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="w-8 h-8 rounded-lg bg-glow-400/20 flex items-center justify-center shrink-0">
                <Shield className="w-4 h-4 text-glow-400" />
              </div>
              <h3 className="font-bold text-sm">Your Keys, Your Funds</h3>
            </div>
            <p className="text-gray-500 text-xs leading-relaxed">
              Payments settle directly into your account. Glow Pay never holds your funds.
            </p>
          </div>
          <div className="bg-surface-800/50 border border-white/[0.06] rounded-xl p-4">
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center shrink-0">
                <Zap className="w-4 h-4 text-cyan-400" />
              </div>
              <h3 className="font-bold text-sm">Instant Settlement</h3>
            </div>
            <p className="text-gray-500 text-xs leading-relaxed">
              Transactions confirm in under a second with fees measured in fractions of a cent.
            </p>
          </div>
          <div className="bg-surface-800/50 border border-white/[0.06] rounded-xl p-4">
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="w-8 h-8 rounded-lg bg-bitcoin/20 flex items-center justify-center shrink-0">
                <Globe className="w-4 h-4 text-bitcoin" />
              </div>
              <h3 className="font-bold text-sm">Global Payments</h3>
            </div>
            <p className="text-gray-500 text-xs leading-relaxed">
              Accept payments from customers worldwide. No banking infrastructure required.
            </p>
          </div>
        </div>

        {/* How it works */}
        <div className="bg-surface-800/30 border border-white/[0.06] rounded-xl p-5">
          <h2 className="text-base font-bold text-center mb-4">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="w-8 h-8 rounded-full bg-glow-400 text-surface-900 text-sm font-bold flex items-center justify-center mx-auto mb-2">1</div>
              <h3 className="font-semibold text-sm mb-0.5">Set Up in Minutes</h3>
              <p className="text-gray-500 text-xs">Create a secure account and generate your payment addresses.</p>
            </div>
            <div className="text-center">
              <div className="w-8 h-8 rounded-full bg-glow-400 text-surface-900 text-sm font-bold flex items-center justify-center mx-auto mb-2">2</div>
              <h3 className="font-semibold text-sm mb-0.5">Connect Your Store</h3>
              <p className="text-gray-500 text-xs">Use the REST API to create payment links, or generate them from the dashboard.</p>
            </div>
            <div className="text-center">
              <div className="w-8 h-8 rounded-full bg-glow-400 text-surface-900 text-sm font-bold flex items-center justify-center mx-auto mb-2">3</div>
              <h3 className="font-semibold text-sm mb-0.5">Get Paid</h3>
              <p className="text-gray-500 text-xs">Funds arrive directly in your account. No middlemen.</p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/[0.06]">
        <div className="max-w-5xl mx-auto px-4 py-4 text-center text-gray-600 text-xs">
          Powered by Breez SDK
        </div>
      </footer>
    </div>
  )
}
