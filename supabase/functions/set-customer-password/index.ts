// supabase/functions/set-customer-password/index.ts
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
      JSON.stringify({ ok: false, code: "METHOD_NOT_ALLOWED", message: "Method not allowed" }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  try {
    const body = await req.json();
    const { customer_id, customer_email, user_id, new_password } = body as {
      customer_id?: string;
      customer_email?: string;
      user_id?: string;
      new_password?: string;
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

    // 0) Require authenticated admin caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ ok: false, code: "AUTH_REQUIRED", message: "Please sign in to continue." }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!projectUrl || !anonKey || !serviceRoleKey) {
      console.error("[set-customer-password] Missing env vars", {
        hasProjectUrl: !!projectUrl,
        hasAnonKey: !!anonKey,
        hasServiceRoleKey: !!serviceRoleKey,
      });
      return new Response(
        JSON.stringify({
          ok: false,
          code: "SERVER_CONFIG_ERROR",
          message: "Missing PROJECT_URL / ANON_KEY / SERVICE_ROLE_KEY",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const callerClient = createClient(projectUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: authData, error: authError } = await callerClient.auth.getUser();
    const callerUser = authData?.user;
    if (authError || !callerUser) {
      return new Response(
        JSON.stringify({ ok: false, code: "AUTH_REQUIRED", message: "Please sign in to continue." }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { data: callerProfile, error: profileError } = await callerClient
      .from("profiles")
      .select("id, role, company_id")
      .eq("id", callerUser.id)
      .maybeSingle();

    if (profileError || !callerProfile) {
      return new Response(
        JSON.stringify({ ok: false, code: "PROFILE_NOT_FOUND", message: "Caller profile not found." }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (callerProfile.role !== "admin") {
      return new Response(
        JSON.stringify({ ok: false, code: "FORBIDDEN", message: "Only admins can set customer passwords." }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!callerProfile.company_id) {
      return new Response(
        JSON.stringify({ ok: false, code: "NO_COMPANY", message: "Caller has no company context." }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Check if caller is in support mode
    const { data: isSupportMode, error: supportModeError } = await callerClient.rpc("is_support_mode");
    if (!supportModeError && isSupportMode === true) {
      return new Response(
        JSON.stringify({ ok: false, code: "SUPPORT_MODE_READ_ONLY", message: "Password operations are disabled in support mode." }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Billing status check: reject unpaid/canceled
    const { data: companyData, error: companyError } = await callerClient
      .from("companies")
      .select("subscription_status")
      .eq("id", callerProfile.company_id)
      .maybeSingle();

    if (companyError || !companyData) {
      // Fail closed: unknown status treated as read-only
      return new Response(
        JSON.stringify({ ok: false, code: "BILLING_READ_ONLY", message: "Workspace is in read-only mode. Please resolve billing to continue." }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const subscriptionStatus = companyData.subscription_status;
    if (!subscriptionStatus || subscriptionStatus === "unpaid" || subscriptionStatus === "canceled") {
      const message = subscriptionStatus === "unpaid"
        ? "Workspace is in read-only mode due to unpaid billing. Please resolve billing to continue."
        : subscriptionStatus === "canceled"
        ? "Workspace is in read-only mode due to canceled subscription. Please reactivate billing to continue."
        : "Workspace is in read-only mode. Please resolve billing to continue.";
      return new Response(
        JSON.stringify({ ok: false, code: "BILLING_READ_ONLY", message }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // b) Validate required fields
    if (!new_password || new_password.trim().length < 8) {
      return new Response(
        JSON.stringify({
          ok: false,
          code: "MISSING_FIELDS",
          message: "new_password is required and must be at least 8 characters",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!customer_email || !customer_email.trim()) {
      return new Response(
        JSON.stringify({
          ok: false,
          code: "MISSING_FIELDS",
          message: "customer_email is required",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!customer_id) {
      return new Response(
        JSON.stringify({
          ok: false,
          code: "MISSING_FIELDS",
          message: "customer_id is required",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabaseAdmin = createClient(projectUrl, serviceRoleKey);

    // Resolve customer inside caller company before any auth-user admin action
    const { data: customer, error: customerError } = await supabaseAdmin
      .from("customers")
      .select("id, company_id, user_id, email")
      .eq("id", customer_id)
      .eq("company_id", callerProfile.company_id)
      .maybeSingle();

    if (customerError || !customer) {
      return new Response(
        JSON.stringify({
          ok: false,
          code: "CUSTOMER_NOT_FOUND",
          message: "Customer not found for this company.",
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!customer.user_id) {
      return new Response(
        JSON.stringify({
          ok: false,
          code: "USER_NOT_FOUND",
          message: "Customer must be linked to an auth user first.",
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (user_id && user_id !== customer.user_id) {
      return new Response(
        JSON.stringify({
          ok: false,
          code: "USER_ID_MISMATCH",
          message: "Provided user_id does not match customer linkage.",
        }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const resolvedUserId = customer.user_id;

    const customerRecordEmail = customer.email ? String(customer.email).toLowerCase().trim() : null;
    const requestedCustomerEmail = customer_email ? customer_email.toLowerCase().trim() : null;
    if (customerRecordEmail && requestedCustomerEmail && customerRecordEmail !== requestedCustomerEmail) {
      return new Response(
        JSON.stringify({
          ok: false,
          code: "CUSTOMER_EMAIL_MISMATCH",
          message: "Provided customer email does not match customer record.",
        }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // c) Resolve the auth user
    const { data: userData, error: getErr } =
      await supabaseAdmin.auth.admin.getUserById(resolvedUserId);

    if (getErr || !userData?.user) {
      console.error("[set-customer-password] User not found", {
        user_id: resolvedUserId,
        error: getErr?.message,
      });
      return new Response(
        JSON.stringify({
          ok: false,
          code: "USER_NOT_FOUND",
          message: "Auth user not found for given user_id",
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const authEmail = userData.user.email ?? null;

    // d) Email safety check
    if (authEmail && customer_email) {
      const authEmailLower = authEmail.toLowerCase().trim();
      const customerEmailLower = customer_email.toLowerCase().trim();

      if (authEmailLower !== customerEmailLower) {
        console.error("[set-customer-password] Email mismatch", {
          user_id: resolvedUserId,
          customer_id,
          auth_email: authEmail,
          customer_email: customer_email,
        });
        return new Response(
          JSON.stringify({
            ok: false,
            code: "EMAIL_MISMATCH",
            message: "Customer email does not match linked auth user email",
            auth_email: authEmail,
            customer_email: customer_email,
          }),
          {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }

    console.log("[set-customer-password] Updating password for", {
      user_id: resolvedUserId,
      customer_id,
      email: authEmail,
      customer_email: customer_email,
    });

    // e) If emails match, update the password
    const { error: updateErr } =
      await supabaseAdmin.auth.admin.updateUserById(resolvedUserId, {
        password: new_password.trim(),
      });

    if (updateErr) {
      console.error("[set-customer-password] updateUserById error", {
        user_id: resolvedUserId,
        message: updateErr.message,
      });
      return new Response(
        JSON.stringify({
          ok: false,
          code: "UPDATE_FAILED",
          message: updateErr.message,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log("[set-customer-password] Password updated OK", {
      user_id: resolvedUserId,
      customer_id,
      email: authEmail,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        code: "PASSWORD_UPDATED",
        user_id: resolvedUserId,
        user_email: authEmail,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("[set-customer-password] Unexpected error", err);
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return new Response(
      JSON.stringify({
        ok: false,
        code: "INTERNAL_ERROR",
        message: message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
