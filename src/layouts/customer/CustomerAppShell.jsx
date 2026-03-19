import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useUser } from '../../context/UserContext'
import { useBrand } from '../../context/BrandContext'
import { supabase } from '../../supabaseClient'
import Button from '../../components/ui/Button'
import { Menu, X, Home, Briefcase, FileText, Receipt, Calendar, User, LogOut } from 'lucide-react'
import toast from 'react-hot-toast'

export default function CustomerAppShell({ children, title }) {
  const { session, fullName } = useUser()
  const { brand } = useBrand()
  const location = useLocation()
  const navigate = useNavigate()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const currentYear = new Date().getFullYear()
  const companyDisplayName = brand?.companyDisplayName || 'Company'

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

  const navItems = [
    { path: '/customer/dashboard', label: 'Dashboard', icon: Home },
    { path: '/customer/jobs', label: 'My Jobs', icon: Briefcase },
    { path: '/customer/quotes', label: 'Quotes', icon: FileText },
    { path: '/customer/invoices', label: 'Invoices', icon: Receipt },
    { path: '/customer/schedule', label: 'Schedule', icon: Calendar },
    { path: '/customer/profile', label: 'Profile', icon: User },
  ]

  const isActive = (path) => {
    if (path === '/customer/dashboard') {
      return location.pathname === '/customer' || location.pathname === '/customer/dashboard'
    }
    return location.pathname.startsWith(path)
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header 
        className="bg-white border-b border-slate-200 sticky top-0 z-50"
        style={{ borderBottomColor: 'var(--brand-primary, #22c55e)' + '20' }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo and Brand */}
            <div className="flex items-center gap-3">
              <Link to="/customer/dashboard" className="flex items-center gap-3">
                {brand?.logoUrl && (
                  <img
                    src={brand.logoUrl}
                    alt={companyDisplayName}
                    className="h-8 w-auto object-contain"
                  />
                )}
                <span
                  className="text-xl font-bold"
                  style={{ color: 'var(--brand-primary, #22c55e)' }}
                >
                  {companyDisplayName}
                </span>
              </Link>
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon
                const active = isActive(item.path)
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                      active
                        ? 'text-white'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                    style={
                      active
                        ? {
                            backgroundColor: 'var(--brand-primary, #22c55e)',
                            color: 'var(--brand-on-primary, #ffffff)',
                          }
                        : {}
                    }
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                )
              })}
            </nav>

            {/* User Menu and Mobile Toggle */}
            <div className="flex items-center gap-4">
              <div className="hidden md:block text-sm text-slate-600">
                {fullName || session?.user?.email || 'Account'}
              </div>
              <Button
                onClick={logout}
                variant="secondary"
                className="hidden md:flex items-center gap-2"
              >
                <LogOut className="h-4 w-4" />
                <span>Logout</span>
              </Button>
              
              {/* Mobile Menu Button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 rounded-md text-slate-600 hover:bg-slate-100"
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-200 bg-white">
            <nav className="px-4 py-2 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon
                const active = isActive(item.path)
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-md text-sm font-medium transition-colors ${
                      active
                        ? 'text-white'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                    style={
                      active
                        ? {
                            backgroundColor: 'var(--brand-primary, #22c55e)',
                            color: 'var(--brand-on-primary, #ffffff)',
                          }
                        : {}
                    }
                  >
                    <Icon className="h-5 w-5" />
                    <span>{item.label}</span>
                  </Link>
                )
              })}
              <div className="pt-2 border-t border-slate-200 mt-2">
                <div className="px-4 py-2 text-sm text-slate-600">
                  {fullName || session?.user?.email || 'Account'}
                </div>
                <button
                  onClick={logout}
                  className="flex items-center gap-3 w-full px-4 py-3 rounded-md text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  <LogOut className="h-5 w-5" />
                  <span>Logout</span>
                </button>
              </div>
            </nav>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
        {title && (
          <h1 className="text-2xl font-bold text-slate-900 mb-6">{title}</h1>
        )}
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-xs text-slate-500 text-center">
            © {currentYear} {companyDisplayName}. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}
