import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Zap, Shield, Globe, ArrowRight } from 'lucide-react'
import { getMerchant } from '@/lib/store'

export function LandingPage() {
  const navigate = useNavigate()

  // Redirect to dashboard if already set up
  useEffect(() => {
    const merchant = getMerchant()
    if (merchant) {
      navigate('/dashboard')
    }
  }, [navigate])

  return (
    <div className="min-h-screen gradient-bg">
      {/* Header */}
      <header className="border-b border-white/[0.06] backdrop-blur-md bg-surface-900/50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-glow-400 flex items-center justify-center shadow-lg shadow-glow-400/20">
              <Zap className="w-5 h-5 text-surface-900" />
            </div>
            <span className="text-xl font-bold">Glow Pay</span>
          </div>
          <Link
            to="/dashboard"
            className="px-4 py-2 bg-glow-400 hover:bg-glow-300 active:scale-[0.98] text-surface-900 font-semibold rounded-lg transition-all"
          >
            Dashboard
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-16">
          <h1 className="text-5xl md:text-7xl font-bold mb-6">
            Accept Bitcoin
            <br />
            <span className="text-glow-400 glow-text">in Seconds</span>
          </h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-10">
            Start accepting instant Bitcoin payments on your website. No middlemen, no monthly fees, no custody risk.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/setup"
              className="inline-flex items-center gap-2 px-8 py-4 bg-glow-400 hover:bg-glow-300 active:scale-[0.98] text-surface-900 font-bold rounded-xl text-lg transition-all glow-box"
            >
              Get Started
              <ArrowRight className="w-5 h-5" />
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex items-center gap-2 px-8 py-4 bg-surface-700 hover:bg-surface-600 text-white font-semibold rounded-xl text-lg transition-colors"
            >
              Learn More
            </a>
          </div>
        </div>

        {/* Features */}
        <div id="how-it-works" className="grid md:grid-cols-3 gap-8 mb-20">
          <div className="group bg-surface-800/50 border border-white/[0.06] hover:border-white/[0.12] hover:bg-surface-800/80 rounded-2xl p-8 transition-all">
            <div className="w-12 h-12 rounded-xl bg-glow-400/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Shield className="w-6 h-6 text-glow-400" />
            </div>
            <h3 className="text-xl font-bold mb-2">Your Keys, Your Funds</h3>
            <p className="text-gray-400">
              Payments settle directly into your wallet. Glow Pay never holds or has access to your funds.
            </p>
          </div>
          <div className="group bg-surface-800/50 border border-white/[0.06] hover:border-white/[0.12] hover:bg-surface-800/80 rounded-2xl p-8 transition-all">
            <div className="w-12 h-12 rounded-xl bg-lightning/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Zap className="w-6 h-6 text-purple-400" />
            </div>
            <h3 className="text-xl font-bold mb-2">Instant Settlement</h3>
            <p className="text-gray-400">
              Transactions confirm in under a second with fees measured in fractions of a cent.
            </p>
          </div>
          <div className="group bg-surface-800/50 border border-white/[0.06] hover:border-white/[0.12] hover:bg-surface-800/80 rounded-2xl p-8 transition-all">
            <div className="w-12 h-12 rounded-xl bg-bitcoin/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Globe className="w-6 h-6 text-bitcoin" />
            </div>
            <h3 className="text-xl font-bold mb-2">Global Payments</h3>
            <p className="text-gray-400">
              Accept payments from customers worldwide. No banking infrastructure required.
            </p>
          </div>
        </div>

        {/* How it works */}
        <div className="bg-surface-800/30 border border-white/[0.06] rounded-3xl p-8 md:p-12">
          <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-glow-400 text-surface-900 text-xl font-bold flex items-center justify-center mx-auto mb-4">
                1
              </div>
              <h3 className="text-lg font-bold mb-2">Set Up in Minutes</h3>
              <p className="text-gray-400">
                Create a secure wallet and generate your payment addresses. No accounts, no approvals.
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-glow-400 text-surface-900 text-xl font-bold flex items-center justify-center mx-auto mb-4">
                2
              </div>
              <h3 className="text-lg font-bold mb-2">Connect Your Store</h3>
              <p className="text-gray-400">
                Use the REST API to create payment links from your site, or generate them from the dashboard.
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-glow-400 text-surface-900 text-xl font-bold flex items-center justify-center mx-auto mb-4">
                3
              </div>
              <h3 className="text-lg font-bold mb-2">Get Paid</h3>
              <p className="text-gray-400">
                Receive payments on your site. Funds arrive directly in your wallet, no middlemen.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] mt-20">
        <div className="max-w-6xl mx-auto px-6 py-8 text-center text-gray-500">
          <p>Powered by Breez SDK</p>
        </div>
      </footer>
    </div>
  )
}
