import { Link, Outlet, useLocation } from 'react-router-dom'
import { Zap, Home, Settings, Plus, Code } from 'lucide-react'

const navItems = [
  { path: '/dashboard', icon: Home, label: 'Home', exact: true },
  { path: '/dashboard/payments', icon: Zap, label: 'Payments' },
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
    <div className="min-h-screen gradient-bg flex flex-col md:flex-row">
      {/* Sidebar — desktop only */}
      <aside className="hidden md:flex w-56 bg-surface-800/70 backdrop-blur-md shadow-[1px_0_0_0_rgba(255,255,255,0.04)] flex-col">
        {/* Logo */}
        <div className="px-5 py-4 border-b border-white/5">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-glow-400 flex items-center justify-center shadow-lg shadow-glow-400/20">
              <Zap className="w-4 h-4 text-surface-900" />
            </div>
            <span className="text-lg font-bold">Glow Pay</span>
          </Link>
        </div>

        <nav className="flex-1 px-3 py-3">
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
      </aside>

      {/* Mobile header */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-surface-800/70 backdrop-blur-md border-b border-white/5">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-glow-400 flex items-center justify-center shadow-lg shadow-glow-400/20">
            <Zap className="w-4 h-4 text-surface-900" />
          </div>
          <span className="text-lg font-bold">Glow Pay</span>
        </Link>
        <Link
          to="/dashboard/payments/new"
          className="flex items-center gap-1.5 px-3 py-2 bg-glow-400 hover:bg-glow-300 text-surface-900 font-semibold rounded-lg text-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          New
        </Link>
      </header>

      {/* Main content */}
      <main className="flex-1 p-4 md:p-6 overflow-auto pb-20 md:pb-6">
        <Outlet />
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-surface-800/95 backdrop-blur-md border-t border-white/[0.06] px-2 py-1 z-50">
        <ul className="flex justify-around">
          {navItems.map(({ path, icon: Icon, label, exact }) => (
            <li key={path}>
              <Link
                to={path}
                className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg text-[10px] font-medium transition-colors ${
                  isActive(path, exact)
                    ? 'text-glow-400'
                    : 'text-gray-500'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
