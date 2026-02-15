import { Link, Outlet, useLocation } from 'react-router-dom'
import { Zap, Home, CreditCard, Settings, Plus, Code } from 'lucide-react'

const navItems = [
  { path: '/dashboard', icon: Home, label: 'Home', exact: true },
  { path: '/dashboard/payments', icon: CreditCard, label: 'Payments' },
  { path: '/dashboard/integration', icon: Code, label: 'Integration' },
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
      <aside className="w-64 bg-surface-800/50 border-r border-white/10 flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-white/10">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-glow-400 flex items-center justify-center">
              <Zap className="w-5 h-5 text-surface-900" />
            </div>
            <span className="text-xl font-bold">Glow Pay</span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4">
          <ul className="space-y-1">
            {navItems.map(({ path, icon: Icon, label, exact }) => (
              <li key={path}>
                <Link
                  to={path}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                    isActive(path, exact)
                      ? 'bg-glow-400/20 text-glow-400'
                      : 'text-gray-400 hover:text-white hover:bg-surface-700'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{label}</span>
                </Link>
              </li>
            ))}
          </ul>

          {/* Create Payment Button */}
          <Link
            to="/dashboard/payments/new"
            className="flex items-center gap-3 px-4 py-3 mt-6 bg-glow-400 hover:bg-glow-300 text-surface-900 font-semibold rounded-xl transition-colors"
          >
            <Plus className="w-5 h-5" />
            <span>New Payment</span>
          </Link>
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-white/10">
          <p className="text-xs text-gray-500 text-center">
            Powered by Breez SDK
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
