import Sidebar from "../components/nav/Sidebar";
import Topbar from "../components/nav/Topbar";
import SupportModeBanner from "../components/SupportModeBanner";
import BillingReadOnlyBanner from "../components/BillingReadOnlyBanner";
import { APP_VERSION, BUILD_DATE } from "../lib/version";
import { getDemoModeBanner } from "../lib/demo-mode";

/**
 * AppShell - Main layout wrapper for the white-label SaaS application
 * 
 * @param {Object} props
 * @param {React.ReactNode} props.children - Page content to render
 * @param {string} [props.title] - Optional page title (falls back to route-based label)
 */
export default function AppShell({ children, title }) {
  const demoBanner = getDemoModeBanner();
  
  return (
    <div className="min-h-screen bg-slate-50">
      {demoBanner && (
        <div className="bg-amber-100 border-b border-amber-200 px-6 py-2">
          <p className="text-sm text-amber-800 text-center font-medium">
            {demoBanner}
          </p>
        </div>
      )}
      <SupportModeBanner />
      <BillingReadOnlyBanner />
      <div className="flex">
        <Sidebar />
        <div className="flex-1 min-w-0 md:ml-64 flex flex-col">
          <Topbar title={title} />
          <main className="p-6 flex-1">
            <div className="max-w-6xl mx-auto">{children}</div>
          </main>
          <footer className="border-t border-slate-200 bg-white px-6 py-3">
            <div className="max-w-6xl mx-auto">
              <p className="text-xs text-slate-500 text-center">
                ServiceOS {APP_VERSION === "dev" ? "dev" : `v${APP_VERSION}`} (build: {BUILD_DATE || "dev"})
              </p>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}

