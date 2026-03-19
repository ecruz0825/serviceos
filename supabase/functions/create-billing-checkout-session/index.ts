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

function extractStripeErrorDetails(err: unknown) {
  if (err && typeof err === "object") {
    const maybe = err as {
      message?: string;
      type?: string;
      code?: string;
      statusCode?: number;
    };
    return {
      message: maybe.message || "Stripe request failed.",
      type: maybe.type || null,
      code: maybe.code || null,
      statusCode: typeof maybe.statusCode === "number" ? maybe.statusCode : null,
    };
  }
  return {
    message: "Stripe request failed.",
    type: null,
    code: null,
    statusCode: null,
  };
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
    const stripePriceId = Deno.env.get("STRIPE_SUBSCRIPTION_PRICE_ID") ?? "";
    const stripeStarterPriceId = Deno.env.get("STRIPE_STARTER_PRICE_ID") ?? "";
    const stripeProPriceId = Deno.env.get("STRIPE_PRO_PRICE_ID") ?? "";
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
      .select("id, name, stripe_customer_id, stripe_subscription_id, subscription_status, plan")
      .eq("id", callerProfile.company_id)
      .maybeSingle();

    if (companyError || !company) {
      console.error(JSON.stringify({
        fn: "create-billing-checkout-session",
        code: "COMPANY_NOT_FOUND",
        company_id: callerProfile.company_id,
        error: companyError?.message,
      }));
      return errorResponse(404, "COMPANY_NOT_FOUND", "Company not found.");
    }

    // Parse request body for optional plan selection
    let requestBody: { plan?: string } = {};
    try {
      const bodyText = await req.text();
      if (bodyText) {
        requestBody = JSON.parse(bodyText);
      }
    } catch {
      // Ignore JSON parse errors, use empty object
    }

    // Plan selection logic: request body plan > company.plan (if valid) > "starter"
    const requestedPlan = typeof requestBody.plan === "string" ? requestBody.plan.trim().toLowerCase() : null;
    const companyPlan = company.plan ? company.plan.trim().toLowerCase() : null;
    
    let selectedPlan: string;
    if (requestedPlan === "starter" || requestedPlan === "pro") {
      selectedPlan = requestedPlan;
    } else if (companyPlan === "starter" || companyPlan === "pro") {
      selectedPlan = companyPlan;
    } else {
      selectedPlan = "starter";
    }

    // Map plan to Stripe price ID
    const priceIdMap: Record<string, string> = {
      starter: stripeStarterPriceId || stripePriceId,
      pro: stripeProPriceId,
    };

    const selectedPriceId = priceIdMap[selectedPlan];

    if (!selectedPriceId || selectedPriceId.trim() === "") {
      return errorResponse(
        400,
        "PLAN_PRICE_ID_MISSING",
        `Stripe price ID not configured for plan: ${selectedPlan}. Please configure STRIPE_${selectedPlan.toUpperCase()}_PRICE_ID environment variable.`,
      );
    }

    // Application-layer guardrail: Block checkout if company already has an active subscription.
    // This reduces duplicate checkout attempts but does NOT fully prevent simultaneous
    // race-created Stripe subscriptions by itself. Full protection would require an additional
    // lock/pending-checkout strategy or Stripe-side design change.
    const subscriptionStatus = company.subscription_status || "inactive";
    const hasActiveSubscription = subscriptionStatus === "active" || subscriptionStatus === "trialing";
    const hasSubscriptionRelationship = company.stripe_subscription_id &&
      (subscriptionStatus === "active" || subscriptionStatus === "trialing" ||
       subscriptionStatus === "past_due" || subscriptionStatus === "unpaid");

    if (hasActiveSubscription || hasSubscriptionRelationship) {
      console.log(JSON.stringify({
        fn: "create-billing-checkout-session",
        code: "SUBSCRIPTION_ALREADY_ACTIVE",
        company_id: company.id,
        stripe_customer_id: company.stripe_customer_id,
        stripe_subscription_id: company.stripe_subscription_id,
        subscription_status: subscriptionStatus,
        selected_plan: selectedPlan,
      }));
      return errorResponse(
        409,
        "SUBSCRIPTION_ALREADY_ACTIVE",
        "This company already has an active subscription. Use the Billing Portal to manage it.",
      );
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });

    let stripeCustomerId: string | null = company.stripe_customer_id ?? null;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        name: company.name ?? undefined,
        metadata: {
          company_id: company.id,
          source: "service_ops_saas_billing",
        },
      });

      stripeCustomerId = customer.id;

      const { error: updateCompanyError } = await supabaseAdmin
        .from("companies")
        .update({
          stripe_customer_id: stripeCustomerId,
          billing_updated_at: new Date().toISOString(),
        })
        .eq("id", company.id);

      if (updateCompanyError) {
        return errorResponse(500, "COMPANY_UPDATE_FAILED", "Failed to persist Stripe customer.");
      }
    }

    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: stripeCustomerId,
        line_items: [{ price: selectedPriceId, quantity: 1 }],
        success_url: `${siteUrl}/admin/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${siteUrl}/admin/billing?checkout=canceled`,
        client_reference_id: company.id,
        metadata: {
          company_id: company.id,
          plan: selectedPlan,
        },
        subscription_data: {
          metadata: {
            company_id: company.id,
            plan: selectedPlan,
          },
        },
      });
    } catch (err) {
      const stripeErr = extractStripeErrorDetails(err);
      console.error(JSON.stringify({
        fn: "create-billing-checkout-session",
        code: "STRIPE_CHECKOUT_CREATE_FAILED",
        company_id: company.id,
        stripe_customer_id: stripeCustomerId,
        stripe_error_type: stripeErr.type,
        stripe_error_code: stripeErr.code,
        stripe_status_code: stripeErr.statusCode,
        stripe_error_message: stripeErr.message,
      }));
      return errorResponse(
        stripeErr.statusCode && stripeErr.statusCode >= 400 && stripeErr.statusCode < 500 ? 400 : 500,
        "STRIPE_CHECKOUT_CREATE_FAILED",
        stripeErr.message,
      );
    }

    if (!session.url) {
      return errorResponse(500, "CHECKOUT_URL_MISSING", "Stripe checkout URL was not returned.");
    }

    return jsonResponse(200, {
      ok: true,
      code: "CHECKOUT_SESSION_CREATED",
      message: "Checkout session created.",
      url: session.url,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error.";
    console.error(JSON.stringify({
      fn: "create-billing-checkout-session",
      code: "INTERNAL_ERROR",
      message,
    }));
    return errorResponse(500, "INTERNAL_ERROR", message);
  }
});
