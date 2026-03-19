import { useEffect, useState } from "react";
import { supabase } from "../../supabaseClient";
import { useNavigate } from "react-router-dom";
import { useUser } from "../../context/UserContext";
import { useBrand } from "../../context/BrandContext";
import Button from "../../components/ui/Button";
import toast from "react-hot-toast";

export default function CustomerAcceptInvite() {
  const navigate = useNavigate();
  const { session, role } = useUser();
  const { brand } = useBrand() || {};
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("checking"); // checking | ready | saving | done | error
  const [error, setError] = useState("");

  const companyDisplayName = brand?.companyDisplayName || "Customer Portal";

  useEffect(() => {
    // When opened from an invite/magic link, supabase-js processes the URL hash
    // and establishes a session. We poll to confirm the session exists.
    (async () => {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (currentSession) {
        setStatus("ready");
      } else {
        // Wait a bit for Supabase to process the hash
        setTimeout(async () => {
          const { data: { session: s2 } } = await supabase.auth.getSession();
          if (s2) {
            setStatus("ready");
          } else {
            setStatus("error");
            setError("Invite link invalid or expired. Please request a new invite.");
          }
        }, 600);
      }
    })();
  }, []);

  // Redirect if already logged in and has password set
  useEffect(() => {
    if (session?.user?.id && role === 'customer') {
      // User is already authenticated as customer - redirect to dashboard
      navigate("/customer/dashboard", { replace: true });
    }
  }, [session, role, navigate]);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!password || password.trim().length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    
    setStatus("saving");
    setError("");
    
    const { error: err } = await supabase.auth.updateUser({ password: password.trim() });
    
    if (err) {
      setStatus("ready");
      setError(err.message || "Failed to set password. Please try again.");
      return;
    }
    
    setStatus("done");
    toast.success("Password set successfully!");
    
    // Get user metadata to check for app_next, otherwise default to customer dashboard
    const { data: { user } } = await supabase.auth.getUser();
    const appNext = user?.user_metadata?.app_next || "/customer/dashboard";
    
    // Navigate to customer dashboard (or app_next if it's a customer route)
    const destination = appNext.startsWith("/customer") ? appNext : "/customer/dashboard";
    navigate(destination, { replace: true });
  };

  if (status === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Validating invite…</p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="max-w-md w-full mx-4 bg-white rounded-lg shadow-lg p-6">
          <div className="text-red-600 mb-4">
            <svg className="h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Invite Link Invalid</h2>
          <p className="text-slate-600 mb-4">{error}</p>
          <Button
            onClick={() => navigate("/customer/login", { replace: true })}
            variant="primary"
            className="w-full"
          >
            Go to Login
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="max-w-md w-full mx-4">
        <div className="bg-white rounded-lg shadow-lg p-8">
          {/* Brand Logo/Name */}
          {brand?.logoUrl && (
            <div className="flex justify-center mb-6">
              <img
                src={brand.logoUrl}
                alt={companyDisplayName}
                className="h-12 w-auto object-contain"
              />
            </div>
          )}
          
          <h1 
            className="text-2xl font-bold mb-2 text-center"
            style={{ color: 'var(--brand-primary, #22c55e)' }}
          >
            {companyDisplayName}
          </h1>
          <p className="text-sm text-slate-600 text-center mb-6">Set Your Password</p>

          <form onSubmit={onSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
                Create a Password
              </label>
              <input
                id="password"
                type="password"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter a password (min 8 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                disabled={status === "saving"}
              />
              <p className="mt-1 text-xs text-slate-500">
                Password must be at least 8 characters long.
              </p>
            </div>

            <Button
              type="submit"
              variant="primary"
              className="w-full py-2"
              disabled={status === "saving" || !password.trim() || password.trim().length < 8}
            >
              {status === "saving" ? "Setting password…" : "Set Password"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
