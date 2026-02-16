import { Link, Outlet, useLocation } from 'react-router-dom'
import { Zap, Home, Settings, Plus, Code } from 'lucide-react'

const navItems = [
  { path: '/dashboard', icon: Home, label: 'Home', exact: true },
  { path: '/dashboard/payments', icon: Zap, label: 'Payments' },
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
      <aside className="w-56 bg-surface-800/70 backdrop-blur-md shadow-[1px_0_0_0_rgba(255,255,255,0.04)] flex flex-col">
        {/* Logo */}
        <div className="px-5 py-4 border-b border-white/5">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-glow-400 flex items-center justify-center shadow-lg shadow-glow-400/20">
              <Zap className="w-4 h-4 text-surface-900" />
            </div>
            <span className="text-lg font-bold">Glow Pay</span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-600 px-3 mb-2">Navigation</p>
          <ul className="space-y-1">
            {navItems.map(({ path, icon: Icon, label, exact }) => (
              <li key={path}>
                <Link
                  to={path}
                  className={`relative flex items-center gap-3 px-3 py-2 rounded-xl transition-colors text-sm ${
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
        <div className="px-3 pb-3">
          <div className="border-t border-white/5 pt-3">
            <Link
              to="/dashboard/payments/new"
              className="flex items-center justify-center gap-2 px-3 py-2.5 bg-glow-400 hover:bg-glow-300 active:bg-glow-500 text-surface-900 font-semibold rounded-xl transition-all text-sm"
            >
              <Plus className="w-4 h-4" />
              <span>New Payment</span>
            </Link>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-6 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
