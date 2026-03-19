import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.1";
import Stripe from "npm:stripe@14";

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

function errorResponse(status: number, code: string, message: string) {
  return jsonResponse(status, { ok: false, code, message });
}

const STRIPE_STATUS_TO_APP: Record<string, string> = {
  trialing: "trialing",
  active: "active",
  past_due: "past_due",
  unpaid: "unpaid",
  canceled: "canceled",
  incomplete: "inactive",
  incomplete_expired: "canceled",
  paused: "past_due",
};

function mapStripeStatusToAppStatus(stripeStatus: string | null | undefined): string {
  if (!stripeStatus) return "inactive";
  return STRIPE_STATUS_TO_APP[stripeStatus] || "inactive";
}

function toIsoOrNull(unixSeconds: number | null | undefined): string | null {
  if (!unixSeconds || unixSeconds <= 0) return null;
  return new Date(unixSeconds * 1000).toISOString();
}

function buildGraceUntil(days: number): string {
  const next = new Date();
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString();
}

function resolvePlanFromSubscription(
  subscription: Stripe.Subscription,
  fallbackPlan: string,
): string {
  const firstItem = subscription.items?.data?.[0];
  const priceId = firstItem?.price?.id;
  const lookupKey = firstItem?.price?.lookup_key;
  const metadataPlan = subscription.metadata?.plan;

  // Priority 1: Map from price ID to plan (most authoritative source)
  if (priceId) {
    const stripeStarterPriceId = Deno.env.get("STRIPE_STARTER_PRICE_ID") ?? "";
    const stripeProPriceId = Deno.env.get("STRIPE_PRO_PRICE_ID") ?? "";
    const stripePriceId = Deno.env.get("STRIPE_SUBSCRIPTION_PRICE_ID") ?? ""; // Legacy fallback
    
    // Normalize for comparison
    const normalizedPriceId = priceId.trim();
    
    if (stripeProPriceId && normalizedPriceId === stripeProPriceId.trim()) {
      return "pro";
    }
    if (stripeStarterPriceId && normalizedPriceId === stripeStarterPriceId.trim()) {
      return "starter";
    }
    if (stripePriceId && normalizedPriceId === stripePriceId.trim()) {
      // Legacy: assume starter if using old single price ID
      return "starter";
    }
  }

  // Priority 2: Check price lookup_key
  if (lookupKey && lookupKey.trim()) {
    return lookupKey.trim().toLowerCase();
  }

  // Priority 3: Check subscription metadata (lowest priority, can be overridden)
  if (metadataPlan && metadataPlan.trim()) {
    return metadataPlan.trim().toLowerCase();
  }

  // Priority 4: Fallback to default (but log warning)
  console.log(JSON.stringify({
    fn: "reconcile-billing",
    checkpoint: "plan_resolution_fallback",
    subscription_id: subscription.id,
    has_metadata: !!metadataPlan,
    has_lookup_key: !!lookupKey,
    has_price_id: !!priceId,
    price_id: priceId || null,
    fallback_plan: fallbackPlan || "starter",
    warning: "Could not determine plan from Stripe subscription. Using fallback."
  }));
  
  return fallbackPlan || "starter";
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

    if (!projectUrl || !anonKey || !serviceRoleKey || !stripeSecretKey) {
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

    // Parse request body for company_id
    let requestBody: { company_id?: string } = {};
    try {
      const bodyText = await req.text();
      if (bodyText) {
        requestBody = JSON.parse(bodyText);
      }
    } catch {
      // Ignore JSON parse errors
    }

    const targetCompanyId = requestBody.company_id || callerProfile.company_id;
    if (!targetCompanyId) {
      return errorResponse(400, "COMPANY_ID_REQUIRED", "company_id is required.");
    }

    // Authorization: admin (own company) OR platform_admin (in support mode for target company)
    let isAuthorized = false;
    if (callerProfile.role === "admin" && callerProfile.company_id === targetCompanyId) {
      isAuthorized = true;
    } else if (callerProfile.role === "platform_admin") {
      // Check if platform_admin is in support mode for target company
      const { data: supportSession, error: supportError } = await callerClient
        .from("support_sessions")
        .select("id, target_company_id")
        .eq("platform_admin_id", callerUser.id)
        .eq("target_company_id", targetCompanyId)
        .is("ended_at", null)
        .maybeSingle();

      if (!supportError && supportSession) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return errorResponse(403, "FORBIDDEN", "Not authorized to reconcile this company's billing.");
    }

    const supabaseAdmin = createClient(projectUrl, serviceRoleKey);
    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });

    // Load company record
    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .select(
        "id, plan, subscription_status, stripe_customer_id, stripe_subscription_id, trial_ends_at, billing_grace_until, billing_updated_at"
      )
      .eq("id", targetCompanyId)
      .maybeSingle();

    if (companyError || !company) {
      return errorResponse(404, "COMPANY_NOT_FOUND", "Company not found.");
    }

    // Store old values for history
    const oldValues: Record<string, string | null> = {
      plan: company.plan || null,
      subscription_status: company.subscription_status || null,
      stripe_customer_id: company.stripe_customer_id || null,
      stripe_subscription_id: company.stripe_subscription_id || null,
      trial_ends_at: company.trial_ends_at || null,
      billing_grace_until: company.billing_grace_until || null,
    };

    const warnings: string[] = [];
    let stripeSubscription: Stripe.Subscription | null = null;
    let stripeCustomerId: string | null = company.stripe_customer_id || null;

    // Query Stripe: prefer subscription_id, fallback to customer_id
    if (company.stripe_subscription_id) {
      try {
        stripeSubscription = await stripe.subscriptions.retrieve(company.stripe_subscription_id);
        stripeCustomerId = typeof stripeSubscription.customer === "string"
          ? stripeSubscription.customer
          : stripeSubscription.customer?.id || stripeCustomerId;
      } catch (stripeErr) {
        warnings.push(`Failed to retrieve Stripe subscription ${company.stripe_subscription_id}: ${stripeErr instanceof Error ? stripeErr.message : String(stripeErr)}`);
      }
    } else if (stripeCustomerId) {
      try {
        const subscriptions = await stripe.subscriptions.list({
          customer: stripeCustomerId,
          limit: 10,
        });

        // Prefer active/trialing, then past_due/unpaid, then canceled
        const statusPriority: Record<string, number> = {
          active: 1,
          trialing: 2,
          past_due: 3,
          unpaid: 4,
          canceled: 5,
        };

        const sorted = subscriptions.data.sort((a, b) => {
          const aPriority = statusPriority[a.status] || 99;
          const bPriority = statusPriority[b.status] || 99;
          return aPriority - bPriority;
        });

        if (sorted.length > 0) {
          stripeSubscription = sorted[0];
        } else {
          warnings.push("No Stripe subscriptions found for customer.");
        }
      } catch (stripeErr) {
        warnings.push(`Failed to list Stripe subscriptions for customer ${stripeCustomerId}: ${stripeErr instanceof Error ? stripeErr.message : String(stripeErr)}`);
      }
    } else {
      warnings.push("No Stripe customer ID or subscription ID found. Cannot reconcile.");
      return jsonResponse(200, {
        ok: true,
        company_id: targetCompanyId,
        changed_fields: [],
        previous_values: oldValues,
        new_values: oldValues,
        warnings,
      });
    }

    if (!stripeSubscription) {
      return jsonResponse(200, {
        ok: true,
        company_id: targetCompanyId,
        changed_fields: [],
        previous_values: oldValues,
        new_values: oldValues,
        warnings,
      });
    }

    // Resolve normalized app values from Stripe truth
    const appStatus = mapStripeStatusToAppStatus(stripeSubscription.status);
    // Use "starter" as fallback (not company.plan) to ensure we detect plan changes from Stripe
    const plan = resolvePlanFromSubscription(stripeSubscription, "starter");
    const resolvedStripeCustomerId = typeof stripeSubscription.customer === "string"
      ? stripeSubscription.customer
      : stripeSubscription.customer?.id || stripeCustomerId;
    const resolvedStripeSubscriptionId = stripeSubscription.id;
    const resolvedTrialEndsAt = toIsoOrNull(stripeSubscription.trial_end);
    const resolvedBillingGraceUntil = (appStatus === "past_due" || appStatus === "unpaid")
      ? buildGraceUntil(7)
      : null;

    // Build update payload (only fields that changed)
    const newValues: Record<string, string | null> = {};
    const changedFields: string[] = [];

    if (oldValues.stripe_customer_id !== resolvedStripeCustomerId) {
      newValues.stripe_customer_id = resolvedStripeCustomerId;
      changedFields.push("stripe_customer_id");
    }

    if (oldValues.stripe_subscription_id !== resolvedStripeSubscriptionId) {
      newValues.stripe_subscription_id = resolvedStripeSubscriptionId;
      changedFields.push("stripe_subscription_id");
    }

    if (oldValues.subscription_status !== appStatus) {
      newValues.subscription_status = appStatus;
      changedFields.push("subscription_status");
    }

    if (oldValues.plan !== plan) {
      newValues.plan = plan;
      changedFields.push("plan");
    }

    // Check trial_ends_at (compare as ISO strings or null)
    const oldTrialEndsAt = company.trial_ends_at || null;
    if (oldTrialEndsAt !== resolvedTrialEndsAt) {
      newValues.trial_ends_at = resolvedTrialEndsAt;
      changedFields.push("trial_ends_at");
    }

    // Check billing_grace_until (compare as ISO strings or null)
    const oldBillingGraceUntil = company.billing_grace_until || null;
    if (oldBillingGraceUntil !== resolvedBillingGraceUntil) {
      newValues.billing_grace_until = resolvedBillingGraceUntil;
      changedFields.push("billing_grace_until");
    }

    // Always update billing_updated_at
    newValues.billing_updated_at = new Date().toISOString();

    // Update company if changes found
    if (changedFields.length > 0) {
      const { error: updateError } = await supabaseAdmin
        .from("companies")
        .update(newValues)
        .eq("id", targetCompanyId);

      if (updateError) {
        return errorResponse(500, "UPDATE_FAILED", `Failed to update company: ${updateError.message}`);
      }

      // Record billing history
      const historyRows: Array<{
        company_id: string;
        changed_by: string | null;
        source: string;
        field_name: string;
        old_value: string | null;
        new_value: string | null;
        stripe_event_id: string | null;
        metadata: Record<string, unknown>;
      }> = [];

      for (const field of changedFields) {
        if (field === "billing_updated_at") continue; // Don't log timestamp updates
        historyRows.push({
          company_id: targetCompanyId,
          changed_by: callerUser.id,
          source: "reconciliation",
          field_name: field,
          old_value: oldValues[field] != null ? String(oldValues[field]) : null,
          new_value: newValues[field] != null ? String(newValues[field]) : null,
          stripe_event_id: null,
          metadata: { reconciled_at: new Date().toISOString() },
        });
      }

      if (historyRows.length > 0) {
        const { error: historyError } = await supabaseAdmin
          .from("billing_subscription_history")
          .insert(historyRows);

        if (historyError) {
          console.error(JSON.stringify({
            fn: "reconcile-billing",
            checkpoint: "billing_history_insert_failed",
            company_id: targetCompanyId,
            error: historyError.message,
          }));
          // Don't fail reconciliation if history logging fails
        }
      }

      // Log billing_reconciled product event
      try {
        await supabaseAdmin.from("product_events").insert({
          company_id: targetCompanyId,
          user_id: callerUser.id,
          role: callerProfile.role,
          event_name: "billing_reconciled",
          context: {
            changed_fields_count: changedFields.length,
            had_warning: warnings.length > 0,
          },
        });
      } catch (eventLogError) {
        // Don't fail reconciliation if event logging fails
        console.error(JSON.stringify({
          fn: "reconcile-billing",
          checkpoint: "billing_reconciled_event_log_failed",
          company_id: targetCompanyId,
          error: eventLogError instanceof Error ? eventLogError.message : String(eventLogError),
        }));
      }
    }

    // Build detailed response with plan resolution info
    const firstItem = stripeSubscription.items?.data?.[0];
    const planResolutionInfo = {
      stripe_price_id: firstItem?.price?.id || null,
      stripe_lookup_key: firstItem?.price?.lookup_key || null,
      stripe_metadata_plan: stripeSubscription.metadata?.plan || null,
      resolved_plan: plan,
      previous_plan: oldValues.plan,
      plan_changed: oldValues.plan !== plan,
    };

    return jsonResponse(200, {
      ok: true,
      company_id: targetCompanyId,
      changed_fields: changedFields,
      previous_values: oldValues,
      new_values: changedFields.length > 0 ? newValues : oldValues,
      warnings,
      plan_resolution: planResolutionInfo,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error.";
    console.error(JSON.stringify({
      fn: "reconcile-billing",
      code: "INTERNAL_ERROR",
      message,
    }));
    return errorResponse(500, "INTERNAL_ERROR", message);
  }
});
