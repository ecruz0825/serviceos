import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import toast from 'react-hot-toast'

/**
 * AuthCallback - Handles Supabase magic link authentication
 * Supports multiple Supabase auth formats:
 * - PKCE: ?code=...
 * - Token hash: ?token_hash=...&type=magiclink|recovery|invite
 * - Implicit hash: #access_token=...&refresh_token=...
 */
export default function AuthCallback() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState('exchanging') // 'exchanging' | 'success' | 'error'
  const [errorMessage, setErrorMessage] = useState('') // User-visible error message

  useEffect(() => {
    // Guard: Only run on /auth/callback route
    if (location.pathname !== '/auth/callback') {
      // Silently redirect to login if mounted on wrong route
      navigate('/login', { replace: true })
      return
    }

    const handleAuthCallback = async () => {
      // Get the next destination from query params (only used after successful auth)
      const next = searchParams.get('next') || '/customer/dashboard'
      
      // Helper to get appropriate login path
      const getLoginPath = (destination) => {
        if (destination.startsWith('/customer')) return '/customer/login'
        if (destination.startsWith('/crew')) return '/login'
        return '/login'
      }

      // Helper to clean URL (remove query params and hash)
      const cleanUrl = () => {
        window.history.replaceState({}, document.title, window.location.pathname)
      }

      try {
        const url = new URL(window.location.href);
        const params = url.searchParams;

        // Safe debug logging - only keys, no token values
        const searchKeys = Array.from(params.keys());
        const hashStr = window.location.hash.replace(/^#/, "");
        const hashParams = new URLSearchParams(hashStr);
        const hashKeys = Array.from(hashParams.keys());
        
        console.log("[AuthCallback] url keys", {
          pathname: window.location.pathname,
          searchKeys: searchKeys,
          hashKeys: hashKeys
        });

        // Check for Supabase error fragments in hash FIRST (before processing auth tokens)
        const hashError = hashParams.get("error");
        const hashErrorCode = hashParams.get("error_code");
        const hashErrorDescription = hashParams.get("error_description");

        if (hashError || hashErrorCode) {
          // Log error_code (safe to log)
          console.log("[AuthCallback] Supabase error detected", { error_code: hashErrorCode });
          
          // Show friendly error message
          let friendlyMessage = "We couldn't complete sign-in. Please try again or request a new link.";
          if (hashErrorCode === 'otp_expired') {
            friendlyMessage = "This sign-in link has expired. Please request a new one.";
          } else if (hashErrorDescription) {
            // Decode URL-encoded error description
            const decoded = decodeURIComponent(hashErrorDescription.replace(/\+/g, ' '));
            // Use decoded description if it's user-friendly, otherwise use generic
            friendlyMessage = decoded.length < 100 ? decoded : friendlyMessage;
          }
          
          setErrorMessage(friendlyMessage);
          toast.error(friendlyMessage);
          cleanUrl();
          
          // Redirect to appropriate login route based on next param
          const nextParam = searchParams.get('next');
          const loginPath = nextParam && nextParam.startsWith('/customer') 
            ? '/customer/login' 
            : '/login';
          navigate(loginPath, { replace: true });
          setStatus('error');
          return;
        }

        // Extract PKCE
        const code = params.get("code");

        // Extract token_hash format
        const tokenHash = params.get("token_hash");
        const type = params.get("type");
        const email = params.get("email");

        // Extract implicit hash tokens (#access_token=…)
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");

        // Valid formats check
        const hasPKCE = !!code;
        const hasTokenHash = !!tokenHash && !!type;
        const hasImplicit = !!accessToken && !!refreshToken;

        // Debug log (only once, no tokens)
        console.log("[AuthCallback] detected", { hasPKCE, hasTokenHash, hasImplicit, next })

        // If NO auth params present, silently redirect without errors
        if (!hasPKCE && !hasTokenHash && !hasImplicit) {
          // Clean URL and redirect silently - no toast, no console warnings
          cleanUrl()
          // Use next param if present and safe (starts with /), otherwise go to login
          const nextParam = searchParams.get('next')
          const safeNext = nextParam && nextParam.startsWith('/') ? nextParam : '/login'
          navigate(safeNext, { replace: true })
          return
        }

        let authResult = null

        // Method 1: PKCE code exchange
        if (hasPKCE) {
          setStatus('exchanging')
          const fullUrl = window.location.href
          const { data, error } = await supabase.auth.exchangeCodeForSession(fullUrl)
          
          if (error) {
            console.error('[AuthCallback] Error exchanging code for session:', error)
            
            // Check for token expiry errors
            let friendlyMessage = "We couldn't complete sign-in. Please try again or request a new link.";
            if (error.message?.includes('expired') || error.message?.includes('otp_expired')) {
              friendlyMessage = "This sign-in link has expired. Please request a new one.";
            }
            
            setErrorMessage(friendlyMessage);
            toast.error(friendlyMessage);
            cleanUrl()
            navigate(getLoginPath(next), { replace: true })
            setStatus('error')
            return
          }
          
          authResult = data
        }
        // Method 2: Token hash verification
        else if (hasTokenHash) {
          setStatus('exchanging')
          
          const verifyParams = {
            type: type, // 'magiclink', 'recovery', 'invite', etc.
            token_hash: tokenHash,
          }
          
          // Add email if available (some Supabase flows include it)
          if (email) {
            verifyParams.email = email
          }
          
          const { data, error } = await supabase.auth.verifyOtp(verifyParams)
          
          if (error) {
            console.error('[AuthCallback] Error verifying OTP:', error)
            
            // Check for token expiry errors
            let friendlyMessage = "We couldn't complete sign-in. Please try again or request a new link.";
            if (error.message?.includes('expired') || error.message?.includes('otp_expired')) {
              friendlyMessage = "This sign-in link has expired. Please request a new one.";
            }
            
            setErrorMessage(friendlyMessage);
            toast.error(friendlyMessage);
            cleanUrl()
            navigate(getLoginPath(next), { replace: true })
            setStatus('error')
            return
          }
          
          authResult = data
        }
        // Method 3: Implicit hash tokens
        else if (hasImplicit) {
          setStatus('exchanging')
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })
          
          if (error) {
            console.error('[AuthCallback] Error setting session from hash:', error)
            
            // Check for token expiry errors
            let friendlyMessage = "We couldn't complete sign-in. Please try again or request a new link.";
            if (error.message?.includes('expired') || error.message?.includes('otp_expired')) {
              friendlyMessage = "This sign-in link has expired. Please request a new one.";
            }
            
            setErrorMessage(friendlyMessage);
            toast.error(friendlyMessage);
            cleanUrl()
            navigate(getLoginPath(next), { replace: true })
            setStatus('error')
            return
          }
          
          authResult = data
        }

        // Robustly wait for session establishment (no race condition)
        // Method: Poll getSession() with timeout instead of fixed delay
        const SESSION_TIMEOUT_MS = 8000 // 8 seconds
        const POLL_INTERVAL_MS = 200 // Check every 200ms
        const startTime = Date.now()
        
        let session = authResult?.session
        let user = authResult?.session?.user
        
        // If we have a session from authResult, verify it's actually readable
        if (session?.user) {
          // Double-check session is actually established in storage
          const { data: { session: verifiedSession } } = await supabase.auth.getSession()
          if (verifiedSession?.user) {
            session = verifiedSession
            user = verifiedSession.user
          } else {
            // Session not yet in storage, need to poll
            session = null
            user = null
          }
        }
        
        // Poll for session if not immediately available
        while (!session?.user && (Date.now() - startTime) < SESSION_TIMEOUT_MS) {
          await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
          const { data: { session: polledSession } } = await supabase.auth.getSession()
          if (polledSession?.user) {
            session = polledSession
            user = polledSession.user
            break
          }
        }
        
        // Check if we successfully got a session
        if (session?.user) {
          // Successfully authenticated
          setStatus('success')
          
          // Clean up URL by removing all query params and hash
          cleanUrl()
          
          // Get full user object to access all metadata (including role)
          const { data: { user: fullUser }, error: getUserError } = await supabase.auth.getUser()
          
          if (getUserError) {
            console.warn('[AuthCallback] Error getting full user:', getUserError)
            // Continue with session user if getUser fails
          }
          
          const userToUse = fullUser || user
          const userMetadata = userToUse?.user_metadata || {}
          const authType = type || hashParams.get('type')
          
          // Determine redirect destination with clear precedence:
          // 1. user_metadata.app_next (from invite-user edge function)
          // 2. URL search param 'next' or 'returnTo' (for older flows)
          // 3. Role-based default
          // 4. Fallback to safe route
          
          let redirectDestination = null

          // Password recovery should always land on reset screen
          if (authType === 'recovery') {
            redirectDestination = '/reset-password'
          }
          
          // Priority 1: app_next from user metadata (set by invite-user)
          if (!redirectDestination && userMetadata.app_next) {
            redirectDestination = userMetadata.app_next
          }
          // Priority 2: URL query params
          else if (!redirectDestination) {
            const nextParam = searchParams.get('next') || searchParams.get('returnTo')
            if (nextParam && nextParam.startsWith('/')) {
              redirectDestination = nextParam
            }
          }
          
          // Priority 3: Role-based default
          if (!redirectDestination) {
            const role = userMetadata.role
            if (role === 'platform_admin') {
              redirectDestination = '/platform'
            } else if (role === 'admin' || role === 'manager' || role === 'dispatcher') {
              redirectDestination = role === 'admin' ? '/admin' : '/admin/revenue-hub'
            } else if (role === 'crew') {
              redirectDestination = '/crew'
            } else if (role === 'customer') {
              redirectDestination = '/customer/dashboard'
            }
          }
          
          // Priority 4: Safe fallback
          if (!redirectDestination) {
            redirectDestination = '/login'
          }
          
          // Navigate to intended destination
          navigate(redirectDestination, { replace: true })
        } else {
          // Session establishment failed or timed out
          console.warn('[AuthCallback] No session established after timeout')
          setStatus('error')
          cleanUrl()
          
          // Show clear error message
          const timeoutMessage = 'We couldn\'t complete sign-in. Please try your link again or request a new one.'
          setErrorMessage(timeoutMessage)
          toast.error(timeoutMessage)
          
          // Redirect to appropriate login page
          const nextParam = searchParams.get('next')
          const loginPath = nextParam && nextParam.startsWith('/customer') 
            ? '/customer/login' 
            : '/login'
          navigate(loginPath, { replace: true })
        }
      } catch (err) {
        console.error('[AuthCallback] Error in auth callback:', err)
        const catchMessage = 'An error occurred during authentication. Please try again or request a new link.'
        setErrorMessage(catchMessage)
        toast.error(catchMessage)
        window.history.replaceState({}, document.title, window.location.pathname)
        navigate(getLoginPath(next), { replace: true })
        setStatus('error')
      }
    }

    handleAuthCallback()
  }, [navigate, searchParams, location.pathname])

  // Guard: Don't render UI if not on correct route
  if (location.pathname !== '/auth/callback') {
    return null
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center max-w-md w-full px-4">
        {status === 'error' ? (
          // Error state: show error message prominently
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="text-red-600 mb-4">
              <svg className="h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Sign-in Failed</h2>
            <p className="text-slate-600 mb-4">{errorMessage || 'We couldn\'t complete sign-in. Please try again or request a new link.'}</p>
            <button
              onClick={() => {
                const nextParam = searchParams.get('next')
                const loginPath = nextParam && nextParam.startsWith('/customer') 
                  ? '/customer/login' 
                  : '/login'
                navigate(loginPath, { replace: true })
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Go to Login
            </button>
          </div>
        ) : (
          // Loading/success state: show spinner
          <>
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-slate-600 text-lg">
              {status === 'exchanging' && 'Signing you in...'}
              {status === 'success' && 'Redirecting...'}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
