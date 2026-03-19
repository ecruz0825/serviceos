// supabase/functions/create-customer-login/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request): Promise<Response> => {
  // Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ ok: false, code: "METHOD_NOT_ALLOWED", error: "Method not allowed" }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  try {
    const body = await req.json();
    const { customer_id, email, full_name, company_id, temp_password } = body as {
      customer_id?: string;
      email?: string;
      full_name?: string;
      company_id?: string;
      temp_password?: string;
    };

    // Code → HTTP status map
    const CODE_STATUS: Record<string, number> = {
      VALIDATION_ERROR: 400,
      AUTH_REQUIRED: 401,
      PROFILE_NOT_FOUND: 403,
      FORBIDDEN: 403,
      NO_COMPANY: 403,
      COMPANY_MISMATCH: 403,
      BILLING_READ_ONLY: 403,
      CUSTOMER_NOT_FOUND: 404,
      CUSTOMER_ALREADY_LINKED: 409,
      AUTH_CREATE_FAILED: 500,
      AUTH_UPDATE_FAILED: 500,
      EMAIL_EXISTS_BUT_NOT_FOUND: 500,
      LINK_FAILED: 500,
      SERVER_CONFIG_ERROR: 500,
      INTERNAL_ERROR: 500,
    };

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

    // Helper to return structured error responses with logging
    function fail(code: string, error: string, detail?: any) {
      const status = CODE_STATUS[code] ?? 500;
      console.error(JSON.stringify({
        fn: 'create-customer-login',
        code,
        status,
        customer_id: customer_id || null,
        email: email || null,
        detail,
      }));
      return new Response(
        JSON.stringify({ ok: false, code, error }),
        {
          status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 0) Require authenticated admin caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return fail("AUTH_REQUIRED", "AUTH_REQUIRED");
    }

    if (!projectUrl || !anonKey || !serviceRoleKey) {
      return fail("SERVER_CONFIG_ERROR", "Missing PROJECT_URL / ANON_KEY / SERVICE_ROLE_KEY", {
        hasProjectUrl: !!projectUrl,
        hasAnonKey: !!anonKey,
        hasServiceRoleKey: !!serviceRoleKey,
      });
    }

    const callerClient = createClient(projectUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: authData, error: authError } = await callerClient.auth.getUser();
    const callerUser = authData?.user;
    if (authError || !callerUser) {
      return fail("AUTH_REQUIRED", "AUTH_REQUIRED", authError);
    }

    const { data: callerProfile, error: profileError } = await callerClient
      .from("profiles")
      .select("id, role, company_id")
      .eq("id", callerUser.id)
      .maybeSingle();

    if (profileError || !callerProfile) {
      return fail("PROFILE_NOT_FOUND", "PROFILE_NOT_FOUND", profileError);
    }

    if (callerProfile.role !== "admin") {
      return fail("FORBIDDEN", "FORBIDDEN");
    }

    if (!callerProfile.company_id) {
      return fail("NO_COMPANY", "NO_COMPANY");
    }

    // Check if caller is in support mode
    const { data: isSupportMode, error: supportModeError } = await callerClient.rpc("is_support_mode");
    if (!supportModeError && isSupportMode === true) {
      return fail("SUPPORT_MODE_READ_ONLY", "User account creation is disabled in support mode.");
    }

    const callerCompanyId = callerProfile.company_id;
    if (company_id && company_id !== callerCompanyId) {
      return fail("COMPANY_MISMATCH", "COMPANY_MISMATCH");
    }

    // Billing status check: reject unpaid/canceled
    const { data: companyData, error: companyError } = await callerClient
      .from("companies")
      .select("subscription_status")
      .eq("id", callerCompanyId)
      .maybeSingle();

    if (companyError || !companyData) {
      // Fail closed: unknown status treated as read-only
      return fail("BILLING_READ_ONLY", "Workspace is in read-only mode. Please resolve billing to continue.");
    }

    const subscriptionStatus = companyData.subscription_status;
    if (!subscriptionStatus || subscriptionStatus === "unpaid" || subscriptionStatus === "canceled") {
      const message = subscriptionStatus === "unpaid"
        ? "Workspace is in read-only mode due to unpaid billing. Please resolve billing to continue."
        : subscriptionStatus === "canceled"
        ? "Workspace is in read-only mode due to canceled subscription. Please reactivate billing to continue."
        : "Workspace is in read-only mode. Please resolve billing to continue.";
      return fail("BILLING_READ_ONLY", message);
    }

    // 1) Validate inputs
    if (!email || !email.trim()) {
      return fail("VALIDATION_ERROR", "email is required");
    }

    if (!customer_id) {
      return fail("VALIDATION_ERROR", "customer_id is required");
    }

    if (!temp_password || temp_password.trim().length < 8) {
      return fail("VALIDATION_ERROR", "temp_password is required and must be at least 8 characters");
    }

    const supabaseAdmin = createClient(projectUrl, serviceRoleKey);

    // 2) Ensure customer exists and belongs to caller company
    const { data: customerData, error: customerError } = await supabaseAdmin
      .from("customers")
      .select("id, email, full_name, company_id, user_id")
      .eq("id", customer_id)
      .eq("company_id", callerCompanyId)
      .maybeSingle();

    if (customerError) {
      return fail("CUSTOMER_NOT_FOUND", "Failed to fetch customer record", customerError);
    }

    if (!customerData) {
      return fail("CUSTOMER_NOT_FOUND", "Customer not found or does not belong to this company");
    }

    // 3) Ensure customers.user_id is NULL (prevent overwriting existing login)
    if (customerData.user_id) {
      return fail("CUSTOMER_ALREADY_LINKED", "Customer already has a linked auth user. Use set-customer-password to update password.");
    }

    // 4) Create auth user via admin.createUser (no email sent)
    // Supabase Auth user creation is stable only with minimal metadata in this project.
    // Company/customer linkage is intentionally handled in Postgres via profiles and customers tables.
    const userMetadata = {
      role: "customer",
      full_name: full_name || customerData.full_name || null,
      app_next: "/customer/dashboard",
    };

    console.log(JSON.stringify({
      fn: 'create-customer-login',
      customer_id: customer_id || null,
      email: email.trim(),
      company_id: callerCompanyId || null,
      has_full_name: !!(full_name || customerData.full_name),
      temp_password_length: temp_password ? temp_password.trim().length : 0,
    }));

    const { data: authUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim(),
      password: temp_password.trim(),
      email_confirm: true, // Auto-confirm email to allow immediate login
      user_metadata: userMetadata,
    });

    let newUserId: string;
    let reused = false;

    if (createError || !authUser?.user) {
      // Check if error is due to email already existing
      const errorMsg = createError?.message?.toLowerCase() || "";
      const isEmailExists = 
        createError?.status === 422 || 
        errorMsg.includes("email") && (errorMsg.includes("already") || errorMsg.includes("exists") || errorMsg.includes("registered"));

      if (isEmailExists) {
        // Email already exists - find and reuse existing user
        console.log("[create-customer-login] Email already exists, finding existing user:", email.trim());
        
        const { data: usersList, error: listError } = await supabaseAdmin.auth.admin.listUsers({
          perPage: 1000,
        });

        if (listError) {
          return fail("EMAIL_EXISTS_BUT_NOT_FOUND", "Email exists but failed to find existing user", listError);
        }

        const emailLower = email.trim().toLowerCase();
        const existingUser = usersList?.users?.find(
          (u) => u.email?.toLowerCase() === emailLower
        );

        if (!existingUser) {
          return fail("EMAIL_EXISTS_BUT_NOT_FOUND", "Email exists but user not found in system");
        }

        // Update existing user's password and metadata
        const { data: updatedUser, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
          existingUser.id,
          {
            password: temp_password.trim(),
            user_metadata: userMetadata,
            email_confirm: true,
          }
        );

        if (updateError || !updatedUser?.user) {
          return fail("AUTH_UPDATE_FAILED", updateError?.message || "Failed to update existing auth user", updateError);
        }

        newUserId = existingUser.id;
        reused = true;
        console.log("[create-customer-login] Reusing existing auth user:", {
          user_id: newUserId,
          email: email.trim(),
        });
      } else {
        // Other error - fail
        console.error(JSON.stringify({
          fn: 'create-customer-login',
          code_path: 'AUTH_CREATE_FAILED',
          customer_id: customer_id || null,
          email: email.trim(),
          auth_error: {
            name: createError?.name || null,
            status: createError?.status || null,
            code: createError?.code || null,
            message: createError?.message || null,
          },
        }));
        return fail("AUTH_CREATE_FAILED", createError?.message || "Failed to create auth user", createError);
      }
    } else {
      // Successfully created new user
      newUserId = authUser.user.id;
      reused = false;
    }

    // 5) Create profiles row
    try {
      await supabaseAdmin.from("profiles").upsert({
        id: newUserId,
        email: email.trim(),
        full_name: full_name || customerData.full_name || null,
        role: "customer",
        company_id: callerCompanyId,
      });
    } catch (profileError) {
      console.warn("[create-customer-login] Failed to create profile (non-fatal):", profileError);
      // Continue even if profile creation fails (auth user is created)
    }

    // 6) Link public.customers.user_id = created_user.id (only if still null)
    const { error: linkError } = await supabaseAdmin
      .from("customers")
      .update({ user_id: newUserId })
      .eq("id", customer_id)
      .eq("company_id", callerCompanyId)
      .is("user_id", null); // Safety: only update if still null

    if (linkError) {
      // Auth user was created but linking failed - this is a problem
      return fail("LINK_FAILED", "Auth user created but failed to link to customer record", linkError);
    }

    console.log(JSON.stringify({
      fn: 'create-customer-login',
      ok: true,
      user_id: newUserId,
      reused,
      customer_id,
      email: email.trim(),
    }));

    return new Response(
      JSON.stringify({
        ok: true,
        user_id: newUserId,
        reused,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error(JSON.stringify({
      fn: 'create-customer-login',
      code: 'INTERNAL_ERROR',
      status: 500,
      customer_id: null,
      email: null,
      detail: message,
    }));
    return new Response(
      JSON.stringify({ ok: false, code: "INTERNAL_ERROR", error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
