import { Link, useLocation } from "react-router-dom";
import { useUser } from "../../context/UserContext";
import useCompanySettings from "../../hooks/useCompanySettings";
import { useBrand } from "../../context/BrandContext";
import { getNavSections } from "./navConfig";

export default function Sidebar({ variant = "desktop", onNavigate } = {}) {
  const { role, supportMode } = useUser();
  const { settings } = useCompanySettings();
  const { brand } = useBrand();
  const location = useLocation();

  const brandName = brand?.companyDisplayName || "ServiceOps";
  const logoUrl = brand?.logoUrl || null;

  const navSections = getNavSections({ role, settings, supportMode });

  const isActive = (path) => {
    if (path === "/admin") {
      return location.pathname === "/admin";
    }
    return location.pathname.startsWith(path);
  };

  const asideClassName =
    variant === "mobile"
      ? "flex flex-col w-72 max-w-[85vw] h-full bg-white border-r border-slate-200"
      : "hidden md:flex md:flex-col md:w-64 md:fixed md:inset-y-0 md:left-0 bg-white border-r border-slate-200";

  return (
    <aside className={asideClassName}>
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
          className="text-base font-semibold tracking-tight truncate"
          style={{ color: brand?.primaryColor || "#22c55e" }}
        >
          {brandName}
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        <div className="px-3 space-y-6">
          {navSections
            .filter((section) => section.items && section.items.length > 0)
            .map((section) => {
              return (
                <div key={section.key}>
                  {section.label && (
                    <div className="px-3 mb-2 mt-1">
                      <div className="text-[10px] uppercase tracking-[0.14em] text-slate-400 font-semibold">
                        {section.label}
                      </div>
                    </div>
                  )}
                  <ul className="space-y-1">
                    {section.items.map((item) => {
                      const active = isActive(item.path);
                      const activeColor = brand?.secondaryColor || brand?.primaryColor;
                      const isUtility = !!item.isUtility;
                      const showDescription =
                        variant === "desktop" &&
                        section.key === "primary" &&
                        !!item.description;
                      const activeStyle =
                        active && activeColor
                          ? {
                              backgroundColor: `${activeColor}14`,
                              color: activeColor,
                              borderLeftColor: activeColor,
                            }
                          : {};
                      return (
                        <li key={item.path}>
                          <Link
                            to={item.path}
                            onClick={onNavigate}
                            className={`
                              group flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors duration-150
                              border-l-2 border-l-transparent
                              ${
                                active
                                  ? "bg-slate-100 text-slate-900"
                                  : isUtility
                                    ? "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                              }
                            `}
                            style={activeStyle}
                          >
                            <span className="flex-1 min-w-0">
                              <span className="block truncate">{item.label}</span>
                              {showDescription && (
                                <span
                                  className={`block mt-0.5 leading-tight text-[11px] ${
                                    active ? "text-slate-600" : "text-slate-500"
                                  }`}
                                >
                                  {item.description}
                                </span>
                              )}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
        </div>
      </nav>
    </aside>
  );
}

