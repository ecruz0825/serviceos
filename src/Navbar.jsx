import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { supabase } from './supabaseClient'
import useCompanySettings from "./hooks/useCompanySettings";
import { useUser } from "./context/UserContext";
import { useBrand } from "./context/BrandContext";
import Button from "./components/ui/Button";
import toast from 'react-hot-toast';

export default function Navbar() {
  const { session, role } = useUser();
  const navigate = useNavigate()
  const location = useLocation()
  const { settings } = useCompanySettings();
  const { brand } = useBrand();
  const appTitle = brand?.companyDisplayName || "ServiceOps";
  const logoUrl = brand?.logoUrl || null;

    const crewLabel = settings?.crew_label || "Crew";
  const customerLabel = settings?.customer_label || "Customer";
  const customerLabelPlural = customerLabel.endsWith("s")
    ? customerLabel
    : `${customerLabel}s`;


useEffect(() => {
  if (appTitle) {
    document.title = appTitle;
  }
}, [appTitle]);

  // Update global brand color when brand changes
  useEffect(() => {
    if (brand?.primaryColor) {
      document.documentElement.style.setProperty(
        '--brand-primary',
        brand.primaryColor
      );
    }
  }, [brand?.primaryColor]);


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


    const linkClasses = (path) =>
    `nav-link ${location.pathname === path ? 'nav-link-active' : ''}`;

  return (
    <nav className="bg-white shadow mb-6">
      <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
        <div className="flex gap-2 items-center">
          <Link to="/" className="flex items-center gap-2 mr-4">
  {logoUrl ? (
    <img
      src={logoUrl}
      alt={appTitle}
      className="h-7 w-auto object-contain"
    />
  ) : null}
    <span
    className="text-xl font-bold"
    style={{ color: 'var(--brand-primary)' }}
  >
    {appTitle}
  </span>
</Link>

          {/* Dashboard - role-aware routing */}
          {session && (
            <Link 
              to={
                role === 'platform_admin' ? '/platform' :
                role === 'crew' ? '/crew' : 
                role === 'admin' ? '/admin' : '/'
              } 
              className={linkClasses(
                role === 'platform_admin' ? '/platform' :
                role === 'crew' ? '/crew' : 
                role === 'admin' ? '/admin' : '/'
              )}
            >
              Dashboard
            </Link>
          )}

                    {/* Crew link (for crew role and admin) */}
          {session && (role === 'crew' || role === 'admin') && (
            <Link to="/crew" className={linkClasses('/crew')}>
              {crewLabel}
            </Link>
          )}

          {/* Admin link (tenant admin only, not platform admin) */}
          {session && role === 'admin' && (
  <div className="relative group">
    <span className={linkClasses('/admin') + ' cursor-pointer'}>
      Admin
    </span>
    <div className="absolute z-50 hidden group-hover:block bg-white border rounded shadow-lg mt-2 min-w-[220px]">
      <Link to="/admin" className="block px-4 py-2 hover:bg-gray-100">Dashboard</Link>
      <div className="border-t my-1" />
      <Link to="/admin/settings" className="block px-4 py-2 hover:bg-gray-100">Settings</Link>
      <div className="border-t my-1" />
      <Link to="/admin/jobs" className="block px-4 py-2 hover:bg-gray-100">Jobs</Link>
      <Link
        to="/admin/customers"
        className="block px-4 py-2 hover:bg-gray-100"
      >
        {customerLabelPlural}
      </Link>
      <Link to="/admin/quotes" className="block px-4 py-2 hover:bg-gray-100">Quotes</Link>
      <Link to="/admin/operations" className="block px-4 py-2 hover:bg-gray-100">Operations</Link>
      <Link to="/admin/crew" className="block px-4 py-2 hover:bg-gray-100">{crewLabel} Members</Link>
      <Link to="/admin/teams" className="block px-4 py-2 hover:bg-gray-100">Teams</Link>
      <Link to="/admin/recurring-jobs" className="block px-4 py-2 hover:bg-gray-100">Recurring Jobs</Link>
      <div className="border-t my-1" />
      <Link to="/admin/revenue-hub" className="block px-4 py-2 hover:bg-gray-100">Revenue Hub</Link>
      <Link to="/admin/financial-control-center" className="block px-4 py-2 hover:bg-gray-100">Financial Control Center</Link>
      <Link to="/admin/payments" className="block px-4 py-2 hover:bg-gray-100">Payments</Link>
      <Link to="/admin/expenses" className="block px-4 py-2 hover:bg-gray-100">Expenses</Link>
      <Link to="/admin/reports" className="block px-4 py-2 hover:bg-gray-100">Reports</Link>
    </div>
  </div>
)}
        </div>

        {session && (
          <Button
            onClick={logout}
            variant="danger"
            className="px-4 py-1"
          >
            Logout
          </Button>
        )}
      </div>
    </nav>
  )
}