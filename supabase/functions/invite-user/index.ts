// supabase/functions/invite-user/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  return jsonResponse(status, { ok: false, code, error: code, message, ...extra });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorResponse(405, "METHOD_NOT_ALLOWED", "Method not allowed");
  }

  try {
    // ✅ Parse once, include crew_member_id, customer_id, and app_next
    const body = await req.json();
    const { email, full_name, role = "crew", company_id, crew_member_id, customer_id, app_next } = body;
    
    // Diagnostic logging (sanitized - no secrets)
    console.log("[invite-user] Request received:", {
      hasEmail: !!email,
      emailLength: email?.length || 0,
      hasFullName: !!full_name,
      fullNameLength: full_name?.length || 0,
      role: role,
      hasCrewMemberId: !!crew_member_id,
      crewMemberIdLength: crew_member_id?.length || 0,
      hasCustomerId: !!customer_id,
      hasAppNext: !!app_next,
      appNext: app_next,
    });

    if (!email) {
      console.log("[invite-user] 400: email is required");
      return errorResponse(400, "VALIDATION_ERROR", "email is required");
    }

    const normalizedRole = String(role || "crew").trim().toLowerCase();
    const allowedRoles = ["customer", "crew", "admin", "manager", "dispatcher", "platform_admin"];
    if (!allowedRoles.includes(normalizedRole)) {
      console.log("[invite-user] 400: invalid role", { role, normalizedRole, allowedRoles });
      return errorResponse(400, "VALIDATION_ERROR", "role must be one of customer, crew, admin, manager, dispatcher, platform_admin");
    }

    const projectUrl =
      Deno.env.get("PROJECT_URL") ??
      Deno.env.get("SUPABASE_URL") ??
      "";
    const anonKey =
      Deno.env.get("ANON_KEY") ??
      Deno.env.get("SUPABASE_ANON_KEY") ??
      "";
    const serviceRoleKey =
      Deno.env.get("SERVICE_ROLE_KEY") ??
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
      "";

    if (!projectUrl || !anonKey || !serviceRoleKey) {
      return errorResponse(500, "SERVER_CONFIG_ERROR", "Server configuration error");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return errorResponse(401, "AUTH_REQUIRED", "Please sign in to continue.");
    }

    const callerClient = createClient(projectUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: authData, error: authError } = await callerClient.auth.getUser();
    const callerUser = authData?.user;
    if (authError || !callerUser) {
      return errorResponse(401, "AUTH_REQUIRED", "Please sign in to continue.");
    }

    const { data: callerProfile, error: callerProfileError } = await callerClient
      .from("profiles")
      .select("id, role, company_id")
      .eq("id", callerUser.id)
      .maybeSingle();

    if (callerProfileError || !callerProfile) {
      return errorResponse(403, "PROFILE_NOT_FOUND", "Caller profile not found.");
    }

    if (callerProfile.role !== "admin") {
      return errorResponse(403, "FORBIDDEN", "Only admins can send invites.");
    }

    if (!callerProfile.company_id) {
      return errorResponse(403, "NO_COMPANY", "Caller has no company context.");
    }

    // Check if caller is in support mode
    const { data: isSupportMode, error: supportModeError } = await callerClient.rpc("is_support_mode");
    if (!supportModeError && isSupportMode === true) {
      return errorResponse(403, "SUPPORT_MODE_READ_ONLY", "User invites are disabled in support mode.");
    }

    const callerCompanyId = callerProfile.company_id;
    if (company_id && company_id !== callerCompanyId) {
      return errorResponse(403, "COMPANY_MISMATCH", "Provided company_id does not match caller company.");
    }

    const supabase = createClient(projectUrl, serviceRoleKey);

    if (normalizedRole === "customer") {
      if (!customer_id) {
        console.log("[invite-user] 400: customer_id required for customer invites");
        return errorResponse(400, "VALIDATION_ERROR", "customer_id is required for customer invites");
      }

      const { data: customerRecord, error: customerError } = await supabase
        .from("customers")
        .select("id, company_id, email")
        .eq("id", customer_id)
        .maybeSingle();

      if (customerError || !customerRecord) {
        return errorResponse(404, "CUSTOMER_NOT_FOUND", "Customer not found.");
      }

      if (customerRecord.company_id !== callerCompanyId) {
        return errorResponse(403, "FORBIDDEN", "Customer does not belong to caller company.");
      }
    }

    // Crew invites MUST have crew_member_id (canonical flow: create crew_member first, then invite)
    if (normalizedRole === "crew") {
      if (!crew_member_id) {
        console.log("[invite-user] 400: crew_member_id required for crew invites");
        return errorResponse(400, "VALIDATION_ERROR", "crew_member_id is required for crew invites");
      }

      console.log("[invite-user] Validating crew_member_id:", { crew_member_id, callerCompanyId });
      const { data: crewRecord, error: crewError } = await supabase
        .from("crew_members")
        .select("id, company_id")
        .eq("id", crew_member_id)
        .maybeSingle();

      if (crewError) {
        console.log("[invite-user] Crew member lookup error:", { error: crewError.message, code: crewError.code });
      }

      if (crewError || !crewRecord) {
        console.log("[invite-user] 404: Crew member not found", { crew_member_id, crewError: crewError?.message });
        return errorResponse(404, "CREW_MEMBER_NOT_FOUND", "Crew member not found.");
      }

      if (crewRecord.company_id !== callerCompanyId) {
        console.log("[invite-user] 403: Crew member company mismatch", { 
          crewCompanyId: crewRecord.company_id, 
          callerCompanyId 
        });
        return errorResponse(403, "FORBIDDEN", "Crew member does not belong to caller company.");
      }
      
      console.log("[invite-user] Crew member validated successfully");
    }

    // 1) Send Supabase invite email (magic link) → land on role-specific accept page
    const site = Deno.env.get("SITE_URL") || projectUrl || "";
    // ✅ Role-aware redirect: customers go to /customer/accept-invite, others to /auth/callback
    const redirectPath = normalizedRole === "customer"
      ? `${site}/customer/accept-invite`
      : `${site}/auth/callback`;

    // Store the intended destination in user metadata
    // Use provided app_next, or default based on role
    const defaultAppNextByRole: Record<string, string> = {
      customer: "/customer/dashboard",
      crew: "/crew",
      admin: "/admin",
      manager: "/admin/revenue-hub",
      dispatcher: "/admin/revenue-hub",
    };
    const finalAppNext = app_next || defaultAppNextByRole[normalizedRole] || "/login";
    
    // Build user metadata with all relevant fields
    const userMetadata: Record<string, any> = {
      full_name,
      role: normalizedRole,
      app_next: finalAppNext,
      company_id: callerCompanyId,
    };
    
    // Add customer_id to metadata if provided (for customer invites)
    if (customer_id) {
      userMetadata.customer_id = customer_id;
    }
    
    // Add crew_member_id to metadata if provided (for crew invites)
    // This allows the trigger to link the auth user to the crew_members row deterministically
    if (normalizedRole === "crew" && crew_member_id) {
      userMetadata.crew_member_id = crew_member_id;
    }
    
    console.log("[invite-user] Calling inviteUserByEmail:", { 
      email, 
      redirectPath,
      metadataKeys: Object.keys(userMetadata),
      hasFullName: !!userMetadata.full_name,
    });
    
    const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
      email,
      { data: userMetadata, redirectTo: redirectPath }
    );
    
    if (inviteError) {
      const errorMsg = inviteError.message || '';
      const errorMsgLower = errorMsg.toLowerCase();
      
      console.log("[invite-user] inviteUserByEmail error:", {
        message: errorMsg,
        code: inviteError.status || 'unknown',
        statusCode: inviteError.status,
        error: inviteError,
        // Log full error for debugging database errors
        fullError: JSON.stringify(inviteError, Object.getOwnPropertyNames(inviteError)),
      });
      
      // Check if error indicates user already exists - treat as graceful success
      if (errorMsgLower.includes('already') && 
          (errorMsgLower.includes('registered') || errorMsgLower.includes('exists'))) {
        console.log("[invite-user] User already exists - returning success");
        // User already exists - return success with already_registered status
        return new Response(
          JSON.stringify({ 
            ok: true,
            status: 'already_registered', 
            message: errorMsg,
            email: email 
          }),
          { 
            status: 200, 
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      
      // Improve error messages for common cases
      let userFriendlyMessage = errorMsg;
      
      // Rate limit errors
      if (errorMsgLower.includes('rate limit') || 
          errorMsgLower.includes('over_email_send_rate_limit') ||
          errorMsgLower.includes('too many requests')) {
        userFriendlyMessage = "Email rate limit exceeded. Please wait a few minutes before trying again, or use 'Create Login' to set a password directly instead of sending an invite email.";
      }
      // Invalid email errors
      else if (errorMsgLower.includes('invalid') && errorMsgLower.includes('email')) {
        userFriendlyMessage = `Invalid email address: ${email}. Please check the email format and try again.`;
      }
      // Database error during user creation
      else if (errorMsgLower.includes('database error') || errorMsgLower.includes('saving new user')) {
        userFriendlyMessage = `Database error during user creation. This may indicate a trigger or constraint issue. Role: ${normalizedRole}, Company: ${callerCompanyId}, CrewMemberId: ${crew_member_id || 'none'}. Try using 'Create Login' instead.`;
      }
      
      console.log("[invite-user] 400: INVITE_FAILED", { 
        originalMessage: errorMsg,
        userFriendlyMessage,
        code: inviteError.status || 'unknown',
      });
      return errorResponse(400, "INVITE_FAILED", userFriendlyMessage);
    }

    const newUserId = inviteData?.user?.id;
    if (!newUserId) {
      console.log("[invite-user] 400: INVITE_MISSING_USER_ID", { inviteData });
      return errorResponse(400, "INVITE_MISSING_USER_ID", "Invite sent, but missing user id");
    }
    
    console.log("[invite-user] Invite successful:", { newUserId, email });

    // 2) Ensure a profiles row exists (trigger may have created it, but update if needed)
    // Use upsert to handle both creation and update cases
    const { error: profileError } = await supabase.from("profiles").upsert({
      id: newUserId,
      email,
      full_name,
      role: normalizedRole,
      company_id: callerCompanyId,
    }, {
      onConflict: 'id',
    });
    
    if (profileError) {
      console.log("[invite-user] Warning: Profile upsert failed (may already exist from trigger):", {
        error: profileError.message,
        code: profileError.code,
      });
      // Don't fail the invite if profile upsert fails - trigger may have already created it
    } else {
      console.log("[invite-user] Profile upserted successfully");
    }

    // 3) Link crew_members.user_id or customers.user_id based on role
    if (normalizedRole === "crew") {
      if (crew_member_id) {
        await supabase
          .from("crew_members")
          .update({ user_id: newUserId })
          .eq("id", crew_member_id)
          .eq("company_id", callerCompanyId);
      } else {
        // Fallback: link by email + company (only where user_id is still null)
        await supabase
          .from("crew_members")
          .update({ user_id: newUserId })
          .eq("company_id", callerCompanyId)
          .eq("email", email)
          .is("user_id", null);
      }
    } else if (normalizedRole === "customer" && customer_id) {
      // Link customer.user_id when we know the customer record id
      await supabase
        .from("customers")
        .update({ user_id: newUserId })
        .eq("id", customer_id)
        .eq("company_id", callerCompanyId)
        .is("user_id", null); // Safety: only update if still null
    }

    return jsonResponse(200, { 
      ok: true,
      status: 'invited', 
      user_id: newUserId,
      email: email 
    });
  } catch (err) {
    console.error("[invite-user] Unhandled exception:", err);
    // Return generic error message without exposing stack traces
    const errorMessage = err instanceof Error ? err.message : "Internal server error";
    
    // If it's a JSON parse error, return a clearer 400
    if (err instanceof SyntaxError || (err instanceof Error && err.message.includes("JSON"))) {
      console.log("[invite-user] 400: INVALID_JSON");
      return errorResponse(400, "INVALID_JSON", "Invalid request body. Expected JSON.");
    }
    
    console.log("[invite-user] 500: INTERNAL_ERROR", { message: errorMessage });
    return errorResponse(500, "INTERNAL_ERROR", errorMessage);
  }
});