import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.1";
import Stripe from "npm:stripe@14";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(
  status: number,
  payload: { ok: boolean; code: string; message: string; url: string | null; [key: string]: unknown },
) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(status: number, code: string, message: string) {
  return jsonResponse(status, { ok: false, code, message, url: null });
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorResponse(405, "METHOD_NOT_ALLOWED", "Method not allowed.");
  }

  try {
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
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
    const siteUrl = Deno.env.get("SITE_URL") ?? "";

    if (!projectUrl || !anonKey || !serviceRoleKey || !stripeSecretKey || !siteUrl) {
      return errorResponse(
        500,
        "SERVER_CONFIG_ERROR",
        "Missing required environment configuration.",
      );
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
      return errorResponse(403, "FORBIDDEN", "Only admins can manage billing.");
    }

    if (!callerProfile.company_id) {
      return errorResponse(403, "NO_COMPANY", "Caller has no company context.");
    }

    // Check if caller is in support mode
    const { data: isSupportMode, error: supportModeError } = await callerClient.rpc("is_support_mode");
    if (!supportModeError && isSupportMode === true) {
      return errorResponse(403, "SUPPORT_MODE_READ_ONLY", "Billing actions are disabled in support mode.");
    }

    const supabaseAdmin = createClient(projectUrl, serviceRoleKey);

    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .select("id, stripe_customer_id")
      .eq("id", callerProfile.company_id)
      .maybeSingle();

    if (companyError || !company) {
      return errorResponse(404, "COMPANY_NOT_FOUND", "Company not found.");
    }

    if (!company.stripe_customer_id) {
      return errorResponse(
        409,
        "STRIPE_CUSTOMER_MISSING",
        "No Stripe customer is linked yet. Start checkout first.",
      );
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: company.stripe_customer_id,
      return_url: `${siteUrl}/admin/billing`,
    });

    return jsonResponse(200, {
      ok: true,
      code: "PORTAL_SESSION_CREATED",
      message: "Billing portal session created.",
      url: portalSession.url,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error.";
    return errorResponse(500, "INTERNAL_ERROR", message);
  }
});
