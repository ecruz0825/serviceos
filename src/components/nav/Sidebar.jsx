import { Link, useLocation } from "react-router-dom";
import { useUser } from "../../context/UserContext";
import useCompanySettings from "../../hooks/useCompanySettings";
import { useBrand } from "../../context/BrandContext";
import { getNavItems } from "./navConfig";

export default function Sidebar() {
  const { role, supportMode } = useUser();
  const { settings } = useCompanySettings();
  const { brand } = useBrand();
  const location = useLocation();

  const brandName = brand?.companyDisplayName || "ServiceOps";
  const logoUrl = brand?.logoUrl || null;

  const navItems = getNavItems({ role, settings, supportMode });

  const isActive = (path) => {
    if (path === "/admin") {
      return location.pathname === "/admin";
    }
    return location.pathname.startsWith(path);
  };

  return (
    <aside className="hidden md:flex md:flex-col md:w-64 md:fixed md:inset-y-0 md:left-0 bg-white border-r border-slate-200">
      {/* Brand block */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-200">
        {logoUrl && (
          <img
            src={logoUrl}
            alt={brandName}
            className="h-8 w-auto object-contain"
          />
        )}
        <span
          className="text-lg font-bold truncate"
          style={{ color: brand?.primaryColor || "#22c55e" }}
        >
          {brandName}
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        <ul className="space-y-1 px-3">
          {navItems.map((item) => {
            const active = isActive(item.path);
            const activeColor = brand?.secondaryColor || brand?.primaryColor;
            return (
              <li key={item.path}>
                <Link
                  to={item.path}
                  className={`
                    flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                    ${
                      active
                        ? "bg-slate-100 text-slate-900"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    }
                  `}
                  style={
                    active && activeColor
                      ? {
                          backgroundColor: `${activeColor}15`,
                          color: activeColor,
                        }
                      : {}
                  }
                >
                  <span className="flex-1">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}

