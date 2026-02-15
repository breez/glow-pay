import { Link, Outlet, useLocation } from 'react-router-dom'
import { Zap, Home, CreditCard, Settings, Plus, Code } from 'lucide-react'

const navItems = [
  { path: '/dashboard', icon: Home, label: 'Home', exact: true },
  { path: '/dashboard/payments', icon: CreditCard, label: 'Payments' },
  { path: '/dashboard/integration', icon: Code, label: 'API' },
  { path: '/dashboard/settings', icon: Settings, label: 'Settings' },
]

export function DashboardLayout() {
  const location = useLocation()

  const isActive = (path: string, exact?: boolean) => {
    if (exact) {
      return location.pathname === path
    }
    return location.pathname.startsWith(path)
  }

  return (
    <div className="min-h-screen gradient-bg flex">
      {/* Sidebar */}
      <aside className="w-64 bg-surface-800/70 backdrop-blur-md shadow-[1px_0_0_0_rgba(255,255,255,0.04)] flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-white/5">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-glow-400 flex items-center justify-center shadow-lg shadow-glow-400/20">
              <Zap className="w-5 h-5 text-surface-900" />
            </div>
            <span className="text-xl font-bold">Glow Pay</span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-600 px-4 mb-3">Navigation</p>
          <ul className="space-y-1.5">
            {navItems.map(({ path, icon: Icon, label, exact }) => (
              <li key={path}>
                <Link
                  to={path}
                  className={`relative flex items-center gap-3 px-4 py-2.5 rounded-xl transition-colors ${
                    isActive(path, exact)
                      ? 'bg-glow-400/15 text-glow-400'
                      : 'text-gray-400 hover:text-white hover:bg-surface-700'
                  }`}
                >
                  {isActive(path, exact) && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-glow-400 rounded-full" />
                  )}
                  <Icon className="w-5 h-5" />
                  <span className="font-medium">{label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Create Payment Button */}
        <div className="px-4 pb-4">
          <div className="border-t border-white/5 pt-4">
            <Link
              to="/dashboard/payments/new"
              className="flex items-center justify-center gap-2 px-4 py-3 bg-glow-400 hover:bg-glow-300 active:bg-glow-500 text-surface-900 font-semibold rounded-xl transition-all"
            >
              <Plus className="w-5 h-5" />
              <span>New Payment</span>
            </Link>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/5">
          <p className="text-[10px] text-gray-600 text-center tracking-wide">
            Glow Pay
          </p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-8 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
