// src/context/UserContext.jsx
import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { setUserContext } from "../sentry.client";

const UserContext = createContext(null);

export function UserProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [supportMode, setSupportMode] = useState(false);
  const [supportSessionId, setSupportSessionId] = useState(null);
  const [supportTargetCompanyId, setSupportTargetCompanyId] = useState(null);
  const [supportStartedAt, setSupportStartedAt] = useState(null);
  const [supportReason, setSupportReason] = useState(null);

  // Helper to auto-link customer record to auth user
  const autoLinkCustomer = async (userEmail, userId) => {
    if (!userEmail || !userId) return;

    try {
      // Get user's profile to get company_id for tenant scoping
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', userId)
        .maybeSingle();

      if (profileError || !profile?.company_id) {
        // If no profile or company_id, can't safely auto-link
        // This is expected for new users who haven't been assigned a company yet
        return;
      }

      // Find matching customer by email (case-insensitive) within user's company
      const { data: customers, error: customerError } = await supabase
        .from('customers')
        .select('id, company_id, user_id, full_name')
        .ilike('email', userEmail)
        .eq('company_id', profile.company_id) // Defense-in-depth: scope to user's company
        .is('user_id', null) // Only link if not already linked
        .order('created_at', { ascending: false })
        .limit(1);

      if (customerError) {
        console.error('Error finding customer for auto-link:', customerError);
        return;
      }

      if (!customers || customers.length === 0) {
        // No unlinked customer found - that's ok
        return;
      }

      const customer = customers[0];

      // Update customer.user_id (with company_id scoping for defense-in-depth)
      const { error: updateError } = await supabase
        .from('customers')
        .update({ user_id: userId })
        .eq('id', customer.id)
        .eq('company_id', profile.company_id) // Defense-in-depth: ensure company match
        .is('user_id', null); // Safety: only update if still null

      if (updateError) {
        console.error('Error linking customer:', updateError);
        return;
      }

      // Ensure profiles row exists with customer role
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id, role, company_id')
        .eq('id', userId)
        .maybeSingle();

      if (!existingProfile) {
        // Create profile if missing
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: userId,
            company_id: customer.company_id,
            role: 'customer',
            full_name: customer.full_name || null
          });

        if (profileError) {
          console.error('Error creating customer profile:', profileError);
        }
      } else {
        // Profile exists - only update if safe
        // Never overwrite admin/crew roles
        if (existingProfile.role === 'customer' || !existingProfile.role) {
          // Update company_id if wrong, and role if missing
          const updates = {};
          if (existingProfile.company_id !== customer.company_id) {
            updates.company_id = customer.company_id;
          }
          if (!existingProfile.role) {
            updates.role = 'customer';
          }
          if (Object.keys(updates).length > 0) {
            const { error: updateProfileError } = await supabase
              .from('profiles')
              .update(updates)
              .eq('id', userId);

            if (updateProfileError) {
              console.error('Error updating customer profile:', updateProfileError);
            }
          }
        }
      }

      // Write audit log
      try {
        await supabase.rpc('insert_audit_log', {
          p_company_id: customer.company_id,
          p_entity_type: 'customer',
          p_entity_id: customer.id,
          p_action: 'customer_linked',
          p_metadata: {
            email: userEmail,
            user_id: userId,
            customer_name: customer.full_name
          }
        });
      } catch (auditError) {
        console.warn('Failed to write audit log for customer link:', auditError);
        // Don't fail linking if audit log fails
      }
    } catch (err) {
      console.error('Error in auto-link customer:', err);
      // Don't throw - auto-linking is best-effort
    }
  };

  // Helper to load session + profile
  const loadUser = async () => {
    setLoading(true);
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      console.error("Error getting session", sessionError);
    }

    setSession(session || null);

    if (!session?.user?.id) {
      setProfile(null);
      setLoading(false);
      return;
    }

    // Auto-link customer if email matches and customer not linked
    if (session.user.email) {
      await autoLinkCustomer(session.user.email, session.user.id);
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name, role, company_id")
      .eq("id", session.user.id)
      .maybeSingle();

    if (profileError) {
      console.error("Error loading profile", profileError);
      setProfile(null);
    } else if (profile?.company_id) {
      // Fetch company onboarding data
      const { data: company, error: companyError } = await supabase
        .from("companies")
        .select("onboarding_step, setup_completed_at, subscription_status, plan, trial_ends_at, billing_grace_until, billing_updated_at")
        .eq("id", profile.company_id)
        .maybeSingle();

      if (companyError) {
        console.error("Error loading company onboarding data", companyError);
      }

      // Add onboarding data to profile object
      setProfile({
        ...profile,
        onboarding_step: company?.onboarding_step || null,
        setup_completed_at: company?.setup_completed_at || null,
        subscription_status: company?.subscription_status || "inactive",
        plan: company?.plan || "starter",
        trial_ends_at: company?.trial_ends_at || null,
        billing_grace_until: company?.billing_grace_until || null,
        billing_updated_at: company?.billing_updated_at || null,
      });
    } else {
      setProfile(profile || null);
    }

    // Check for active support session if user is platform_admin
    if (profile?.role === 'platform_admin') {
      try {
        const { data: supportSession, error: supportError } = await supabase.rpc(
          'get_active_support_session'
        );

        if (supportError) {
          console.error('Error loading support session:', supportError);
          // Clear support mode state on error
          setSupportMode(false);
          setSupportSessionId(null);
          setSupportTargetCompanyId(null);
          setSupportStartedAt(null);
          setSupportReason(null);
        } else if (supportSession && supportSession.length > 0) {
          const session = supportSession[0];
          setSupportMode(true);
          setSupportSessionId(session.id);
          setSupportTargetCompanyId(session.target_company_id);
          setSupportStartedAt(session.started_at);
          setSupportReason(session.reason);
        } else {
          // No active support session
          setSupportMode(false);
          setSupportSessionId(null);
          setSupportTargetCompanyId(null);
          setSupportStartedAt(null);
          setSupportReason(null);
        }
      } catch (err) {
        console.error('Unexpected error loading support session:', err);
        setSupportMode(false);
        setSupportSessionId(null);
        setSupportTargetCompanyId(null);
        setSupportStartedAt(null);
        setSupportReason(null);
      }
    } else {
      // Not platform_admin, clear support mode state
      setSupportMode(false);
      setSupportSessionId(null);
      setSupportTargetCompanyId(null);
      setSupportStartedAt(null);
      setSupportReason(null);
    }

    // Set Sentry user context when user/profile loads
    if (session?.user && profile) {
      // Use effective company ID (support mode company if in support mode, otherwise profile company)
      const effectiveCompanyId = supportMode && supportTargetCompanyId
        ? supportTargetCompanyId
        : profile.company_id;
      
      setUserContext({
        user: session.user,
        companyId: effectiveCompanyId,
      });
    } else {
      // Clear Sentry user context when logged out
      setUserContext({ user: null, companyId: null });
    }

    setLoading(false);
  };

  // Expose refresh function for components to call after support mode changes
  const refreshUserContext = async () => {
    await loadUser();
  };

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      await loadUser();
      if (cancelled) return;
    };

    init();

    const { data: authSub } = supabase.auth.onAuthStateChange(
      (_event, _session) => {
        // Any auth change → reload user + profile
        loadUser();
      }
    );

    return () => {
      cancelled = true;
      authSub?.subscription?.unsubscribe?.();
    };
  }, []);

  // Calculate effective company ID (support mode company if in support mode, otherwise profile company)
  const effectiveCompanyId = supportMode && supportTargetCompanyId
    ? supportTargetCompanyId
    : (profile?.company_id || null);

  const value = {
    session,
    profile,
    loading,
    role: profile?.role || null, // Real role (preserved, never mutated)
    companyId: profile?.company_id || null, // Real company ID from profile
    effectiveCompanyId, // Effective company ID (support mode or profile company)
    fullName: profile?.full_name || null,
    subscriptionStatus: profile?.subscription_status || "inactive",
    plan: profile?.plan || "starter",
    trialEndsAt: profile?.trial_ends_at || null,
    billingGraceUntil: profile?.billing_grace_until || null,
    billingUpdatedAt: profile?.billing_updated_at || null,
    // Support mode state
    supportMode,
    supportSessionId,
    supportTargetCompanyId,
    supportStartedAt,
    supportReason,
    // Refresh function for support mode state changes
    refreshUserContext,
  };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return ctx;
}
