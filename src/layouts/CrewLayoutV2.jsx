import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useUser } from '../context/UserContext'
import { useBrand } from '../context/BrandContext'
import { supabase } from '../supabaseClient'
import Button from '../components/ui/Button'
import PWAInstallPrompt from '../components/PWAInstallPrompt'
import { Menu, X, LayoutDashboard, Briefcase, HelpCircle, LogOut, User, ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'

/**
 * CrewLayoutV2 - Professional layout for crew portal with sidebar navigation
 * 
 * Features:
 * - Left sidebar (desktop) / collapsible (mobile)
 * - Top bar with company branding and user info
 * - Crew-only navigation (no admin links)
 * - Brand-aware theming
 */
export default function CrewLayoutV2({ children }) {
  const { session, role, fullName } = useUser()
  const { brand } = useBrand()
  const location = useLocation()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const brandName = brand?.companyDisplayName || 'ServiceOps'
  const logoUrl = brand?.logoUrl || null
  const primaryColor = brand?.primaryColor || '#2563eb'
  const secondaryColor = brand?.secondaryColor || brand?.primaryColor || '#2563eb'
  const userDisplay = fullName || session?.user?.email || 'Account'

  const logout = async () => {
    try {
      await supabase.auth.signOut();
      toast.success("Signed out successfully.");
      window.location.href = "/login";
    } catch (error) {
      console.error("Error signing out:", error);
      // Still redirect even if signOut fails
      window.location.href = "/login";
    }
  }

  const isActive = (path) => {
    if (path === '/crew') {
      return location.pathname === '/crew'
    }
    return location.pathname.startsWith(path)
  }

  // Crew-only navigation items
  const navItems = [
    {
      path: '/crew',
      label: 'Dashboard',
      icon: LayoutDashboard,
    },
    {
      path: '/crew/jobs',
      label: 'Jobs',
      icon: Briefcase,
    },
    {
      path: '/crew/help',
      label: 'Help',
      icon: HelpCircle,
    },
  ]

  const activeColor = secondaryColor || primaryColor

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar - Desktop */}
      <aside className="hidden lg:flex lg:flex-shrink-0">
        <div className="w-64 bg-white border-r border-slate-200 flex flex-col">
          {/* Logo/Brand */}
          <div className="p-4 border-b border-slate-200">
            <Link to="/crew" className="flex items-center gap-3">
              {logoUrl && (
                <img
                  src={logoUrl}
                  alt={brandName}
                  className="h-8 w-auto object-contain"
                />
              )}
              <span
                className="text-lg font-bold"
                style={{ color: primaryColor }}
              >
                {brandName}
              </span>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon
              const active = isActive(item.path)
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`
                    flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                    ${
                      active
                        ? 'text-slate-900'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }
                  `}
                  style={
                    active
                      ? {
                          backgroundColor: `${activeColor}15`,
                          color: activeColor,
                        }
                      : {}
                  }
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </nav>

          {/* User section */}
          <div className="p-4 border-t border-slate-200">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center">
                <User className="w-4 h-4 text-slate-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">
                  {userDisplay}
                </p>
                <p className="text-xs text-slate-500">Worker</p>
              </div>
            </div>
            <Button
              onClick={logout}
              variant="tertiary"
              className="w-full justify-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </Button>
          </div>
        </div>
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - Mobile */}
      <aside
        className={`
          fixed top-0 left-0 h-full w-64 bg-white border-r border-slate-200 z-50 transform transition-transform duration-300 ease-in-out lg:hidden
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="flex flex-col h-full">
          {/* Header with close button */}
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <Link to="/crew" className="flex items-center gap-3" onClick={() => setSidebarOpen(false)}>
              {logoUrl && (
                <img
                  src={logoUrl}
                  alt={brandName}
                  className="h-8 w-auto object-contain"
                />
              )}
              <span
                className="text-lg font-bold"
                style={{ color: primaryColor }}
              >
                {brandName}
              </span>
            </Link>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-2 rounded-md text-slate-600 hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {navItems.map((item) => {
              const Icon = item.icon
              const active = isActive(item.path)
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={`
                    flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                    ${
                      active
                        ? 'text-slate-900'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }
                  `}
                  style={
                    active
                      ? {
                          backgroundColor: `${activeColor}15`,
                          color: activeColor,
                        }
                      : {}
                  }
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </nav>

          {/* User section */}
          <div className="p-4 border-t border-slate-200">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center">
                <User className="w-4 h-4 text-slate-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">
                  {userDisplay}
                </p>
                <p className="text-xs text-slate-500">Worker</p>
              </div>
            </div>
            <Button
              onClick={logout}
              variant="tertiary"
              className="w-full justify-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </Button>
          </div>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
          <div className="px-4 py-3 flex items-center justify-between">
            {/* Mobile menu button */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-md text-slate-600 hover:bg-slate-100"
            >
              <Menu className="w-6 h-6" />
            </button>

            {/* Desktop: show brand name (logo is in sidebar) */}
            <div className="hidden lg:flex items-center gap-2">
              <span className="text-sm font-medium text-slate-600">Crew Portal</span>
            </div>

            {/* User info and actions */}
            <div className="flex items-center gap-4">
              {role === 'admin' && (
                <Button
                  onClick={() => navigate('/admin')}
                  variant="tertiary"
                  className="flex items-center gap-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to Admin
                </Button>
              )}
              <div className="hidden sm:flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center">
                  <User className="w-4 h-4 text-slate-600" />
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-slate-900">{userDisplay}</p>
                  <p className="text-xs text-slate-500">Worker</p>
                </div>
              </div>
              <Button
                onClick={logout}
                variant="tertiary"
                className="hidden sm:flex items-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </Button>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          <div className="max-w-7xl mx-auto px-4 py-6">
            {children}
          </div>
        </main>
      </div>

      <PWAInstallPrompt />
    </div>
  )
}
