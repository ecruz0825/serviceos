import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.1";
import Stripe from "npm:stripe@14";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

type CompanyRow = {
  id: string;
  plan: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id?: string | null;
  subscription_status?: string | null;
  trial_ends_at?: string | null;
  billing_grace_until?: string | null;
  billing_updated_at?: string | null;
};

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

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(status: number, code: string, message: string) {
  return jsonResponse(status, { ok: false, code, message });
}

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
    fn: "stripe-webhook",
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

function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  const code = (error as any).code;

  // PostgreSQL deadlock error code
  if (code === "40P01") {
    return true;
  }

  // PostgreSQL lock timeout / lock not available error code
  if (code === "55P03") {
    return true;
  }

  // Connection pool / network transient failures
  if (
    message.includes("connection") ||
    message.includes("timeout") ||
    message.includes("network") ||
    message.includes("fetch failed") ||
    message.includes("connection reset") ||
    message.includes("connection pool") ||
    message.includes("econnreset") ||
    message.includes("etimedout")
  ) {
    return true;
  }

  // Supabase-specific transient errors
  if (
    message.includes("service unavailable") ||
    message.includes("rate limit") ||
    message.includes("too many requests")
  ) {
    return true;
  }

  // Conservative: if uncertain, treat as permanent
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorResponse(405, "METHOD_NOT_ALLOWED", "Method not allowed.");
  }

  const projectUrl =
    Deno.env.get("PROJECT_URL") ??
    Deno.env.get("SUPABASE_URL") ??
    "";
  const serviceRoleKey =
    Deno.env.get("SERVICE_ROLE_KEY") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    "";
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  const stripeWebhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

  if (!projectUrl || !serviceRoleKey || !stripeSecretKey || !stripeWebhookSecret) {
    console.error(JSON.stringify({
      fn: "stripe-webhook",
      code: "SERVER_CONFIG_ERROR",
      has_project_url: !!projectUrl,
      has_service_role_key: !!serviceRoleKey,
      has_stripe_secret_key: !!stripeSecretKey,
      has_stripe_webhook_secret: !!stripeWebhookSecret,
    }));
    return errorResponse(500, "SERVER_CONFIG_ERROR", "Missing required environment configuration.");
  }

  const supabaseAdmin = createClient(projectUrl, serviceRoleKey);
  const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });

  const signature = req.headers.get("stripe-signature");
  console.log(JSON.stringify({
    fn: "stripe-webhook",
    checkpoint: "signature_header_check",
    has_signature_header: !!signature,
    has_webhook_secret: !!stripeWebhookSecret,
  }));
  if (!signature) {
    console.error(JSON.stringify({
      fn: "stripe-webhook",
      code: "SIGNATURE_MISSING",
      message: "Missing stripe-signature header.",
    }));
    return errorResponse(400, "SIGNATURE_MISSING", "Missing stripe-signature header.");
  }

  const rawBodyBuffer = await req.arrayBuffer();
  const rawBody = new Uint8Array(rawBodyBuffer);
  console.log(JSON.stringify({
    fn: "stripe-webhook",
    checkpoint: "raw_body_loaded",
    payload_bytes: rawBody.byteLength,
  }));

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      stripeWebhookSecret,
    );
    console.log(JSON.stringify({
      fn: "stripe-webhook",
      checkpoint: "signature_verification_succeeded",
      event_id: event.id,
      event_type: event.type,
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid webhook signature.";
    console.error(JSON.stringify({
      fn: "stripe-webhook",
      checkpoint: "signature_verification_failed",
      code: "SIGNATURE_VERIFICATION_FAILED",
      message,
    }));
    return errorResponse(400, "SIGNATURE_VERIFICATION_FAILED", message);
  }

  // Claim event for idempotent processing
  let ledgerId: string | null = null;
  const { data: claimedLedgerId, error: claimError } = await supabaseAdmin.rpc("claim_stripe_event", {
    p_event_id: event.id,
  });

  if (claimError) {
    console.error(JSON.stringify({
      fn: "stripe-webhook",
      checkpoint: "event_claim_failed",
      event_id: event.id,
      code: "EVENT_CLAIM_FAILED",
      message: claimError.message,
    }));
    return errorResponse(500, "EVENT_CLAIM_FAILED", "Failed to claim event for processing.");
  }

  // If event already processed (claimedLedgerId is null), return early
  if (!claimedLedgerId) {
    console.log(JSON.stringify({
      fn: "stripe-webhook",
      checkpoint: "event_already_processed",
      event_id: event.id,
      event_type: event.type,
    }));
    return jsonResponse(200, {
      ok: true,
      code: "EVENT_ALREADY_PROCESSED",
      event_id: event.id,
    });
  }

  ledgerId = claimedLedgerId;

  // Update ledger with event details
  await updateLedger(ledgerId, {
    event_type: event.type,
    payload: event,
    processing_attempts: 1,
  });

  async function findCompany(params: {
    companyIdHint?: string | null;
    stripeCustomerId?: string | null;
  }): Promise<CompanyRow | null> {
    const { companyIdHint, stripeCustomerId } = params;
    console.log(JSON.stringify({
      fn: "stripe-webhook",
      checkpoint: "company_lookup_started",
      has_company_id_hint: !!companyIdHint,
      has_stripe_customer_id: !!stripeCustomerId,
    }));

    if (companyIdHint) {
      const { data, error } = await supabaseAdmin
        .from("companies")
        .select("id, plan, stripe_customer_id, stripe_subscription_id, subscription_status, trial_ends_at, billing_grace_until, billing_updated_at")
        .eq("id", companyIdHint)
        .maybeSingle();
      if (!error && data) {
        console.log(JSON.stringify({
          fn: "stripe-webhook",
          checkpoint: "company_lookup_succeeded_by_id",
          company_id: data.id,
        }));
        return data as CompanyRow;
      }
    }

    if (stripeCustomerId) {
      const { data, error } = await supabaseAdmin
        .from("companies")
        .select("id, plan, stripe_customer_id, stripe_subscription_id, subscription_status, trial_ends_at, billing_grace_until, billing_updated_at")
        .eq("stripe_customer_id", stripeCustomerId)
        .maybeSingle();
      if (!error && data) {
        console.log(JSON.stringify({
          fn: "stripe-webhook",
          checkpoint: "company_lookup_succeeded_by_customer",
          company_id: data.id,
        }));
        return data as CompanyRow;
      }
    }

    console.error(JSON.stringify({
      fn: "stripe-webhook",
      checkpoint: "company_lookup_failed",
      has_company_id_hint: !!companyIdHint,
      has_stripe_customer_id: !!stripeCustomerId,
    }));
    return null;
  }

  async function recordBillingHistory(
    companyId: string,
    oldCompany: CompanyRow,
    newValues: Record<string, unknown>,
    stripeEventId: string,
    eventType: string,
  ) {
    const billingFields = [
      "plan",
      "subscription_status",
      "stripe_subscription_id",
      "stripe_customer_id",
      "trial_ends_at",
      "billing_grace_until",
    ];

    const historyRows: Array<{
      company_id: string;
      changed_by: null;
      source: string;
      field_name: string;
      old_value: string | null;
      new_value: string | null;
      stripe_event_id: string;
      metadata: Record<string, unknown>;
    }> = [];

    // Only check fields that are explicitly present in the update payload
    for (const field of billingFields) {
      // Skip if field is not in the update payload (omitted fields are not changed)
      if (!(field in newValues)) {
        continue;
      }

      const oldValue = oldCompany[field as keyof CompanyRow];
      const newValue = newValues[field];

      // Only record if value actually changed
      if (oldValue !== newValue) {
        historyRows.push({
          company_id: companyId,
          changed_by: null,
          source: "webhook",
          field_name: field,
          old_value: oldValue != null ? String(oldValue) : null,
          new_value: newValue != null ? String(newValue) : null,
          stripe_event_id: stripeEventId,
          metadata: { event_type: eventType },
        });
      }
    }

    if (historyRows.length > 0) {
      const { error } = await supabaseAdmin
        .from("billing_subscription_history")
        .insert(historyRows);
      if (error) {
        console.error(JSON.stringify({
          fn: "stripe-webhook",
          checkpoint: "billing_history_insert_failed",
          company_id: companyId,
          error: error.message,
        }));
        // Don't throw - history logging failure shouldn't block webhook processing
      }
    }
  }

  async function updateCompanyInternal(
    companyId: string,
    patch: Record<string, unknown>,
    oldCompany: CompanyRow | null,
    stripeEventId: string | null,
    eventType: string | null,
  ) {
    const payload = {
      ...patch,
      billing_updated_at: new Date().toISOString(),
    };
    console.log(JSON.stringify({
      fn: "stripe-webhook",
      checkpoint: "company_update_started",
      company_id: companyId,
      update_fields: Object.keys(payload),
    }));

    const { error } = await supabaseAdmin
      .from("companies")
      .update(payload)
      .eq("id", companyId);
    if (error) {
      console.error(JSON.stringify({
        fn: "stripe-webhook",
        checkpoint: "company_update_failed",
        company_id: companyId,
        code: "COMPANY_UPDATE_FAILED",
        message: error.message || "Failed to update company billing.",
      }));
      // Preserve error code for transient error detection
      const err = new Error(error.message || "Failed to update company billing.");
      (err as any).code = error.code;
      (err as any).details = error.details;
      throw err;
    }

    // Record billing history AFTER successful update
    // Only log fields that were explicitly in the update payload
    if (oldCompany && stripeEventId && eventType) {
      await recordBillingHistory(companyId, oldCompany, patch, stripeEventId, eventType);
    }

    console.log(JSON.stringify({
      fn: "stripe-webhook",
      checkpoint: "company_update_succeeded",
      company_id: companyId,
    }));
  }

  async function updateCompanyWithRetry(
    companyId: string,
    patch: Record<string, unknown>,
    oldCompany: CompanyRow | null,
    stripeEventId: string | null,
    eventType: string | null,
  ) {
    const maxAttempts = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await updateCompanyInternal(companyId, patch, oldCompany, stripeEventId, eventType);
        
        // Success - log if retry succeeded
        if (attempt > 1) {
          console.log(JSON.stringify({
            fn: "stripe-webhook",
            checkpoint: "company_update_retry_succeeded",
            event_id: stripeEventId || null,
            ledger_id: ledgerId || null,
            company_id: companyId,
            attempt: attempt,
            total_attempts: attempt,
          }));
        }
        
        // Update ledger with final attempt count
        if (ledgerId) {
          await updateLedger(ledgerId, {
            processing_attempts: attempt,
          });
        }
        
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const isTransient = isTransientError(error);

        // Log retry attempt
        console.log(JSON.stringify({
          fn: "stripe-webhook",
          checkpoint: "company_update_retry_attempt",
          event_id: stripeEventId || null,
          ledger_id: ledgerId || null,
          company_id: companyId,
          attempt: attempt,
          is_transient: isTransient,
          error_message: lastError.message,
        }));

        // Update ledger with current attempt count
        if (ledgerId) {
          await updateLedger(ledgerId, {
            processing_attempts: attempt,
          });
        }

        // If transient and not last attempt, retry with exponential backoff
        if (isTransient && attempt < maxAttempts) {
          const backoffMs = Math.pow(2, attempt - 1) * 100; // 100ms, 200ms, 400ms
          await sleep(backoffMs);
          continue;
        }

        // Permanent error or max attempts reached - throw
        throw lastError;
      }
    }

    // Should never reach here, but TypeScript requires it
    throw lastError || new Error("Update failed after all retry attempts");
  }

  async function updateCompany(
    companyId: string,
    patch: Record<string, unknown>,
    oldCompany: CompanyRow | null,
    stripeEventId: string | null,
    eventType: string | null,
  ) {
    return updateCompanyWithRetry(companyId, patch, oldCompany, stripeEventId, eventType);
  }

  async function applySubscriptionSnapshot(params: {
    company: CompanyRow;
    subscription: Stripe.Subscription;
    forceStatus?: string;
    stripeEventId?: string | null;
    eventType?: string | null;
  }) {
    const { company, subscription, forceStatus, stripeEventId, eventType } = params;

    const appStatus = forceStatus || mapStripeStatusToAppStatus(subscription.status);
    // Use "starter" as fallback (not company.plan) to ensure we detect plan changes from Stripe
    const plan = resolvePlanFromSubscription(subscription, "starter");

    // Log plan resolution details for debugging
    const firstItem = subscription.items?.data?.[0];
    console.log(JSON.stringify({
      fn: "stripe-webhook",
      checkpoint: "plan_resolution",
      subscription_id: subscription.id,
      company_id: company.id,
      stripe_price_id: firstItem?.price?.id || null,
      stripe_lookup_key: firstItem?.price?.lookup_key || null,
      stripe_metadata_plan: subscription.metadata?.plan || null,
      resolved_plan: plan,
      previous_plan: company.plan,
      plan_changed: company.plan !== plan,
    }));

    await updateCompany(
      company.id,
      {
        stripe_customer_id:
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer?.id || company.stripe_customer_id,
        stripe_subscription_id: subscription.id,
        subscription_status: appStatus,
        plan,
        trial_ends_at: toIsoOrNull(subscription.trial_end),
        billing_grace_until: appStatus === "past_due" || appStatus === "unpaid"
          ? buildGraceUntil(7)
          : null,
      },
      company,
      stripeEventId || null,
      eventType || null,
    );
  }

  async function updateLedger(
    ledgerId: string | null,
    updates: {
      event_type?: string;
      company_id?: string | null;
      payload?: unknown;
      processing_state?: "processing" | "success" | "error" | "ignored";
      processing_attempts?: number;
      processing_error?: string | null;
      processed_at?: string | null;
    },
  ) {
    if (!ledgerId) return;

    const updatePayload: Record<string, unknown> = {};
    if (updates.event_type !== undefined) updatePayload.event_type = updates.event_type;
    if (updates.company_id !== undefined) updatePayload.company_id = updates.company_id;
    if (updates.payload !== undefined) updatePayload.payload = updates.payload;
    if (updates.processing_state !== undefined) updatePayload.processing_state = updates.processing_state;
    if (updates.processing_attempts !== undefined) updatePayload.processing_attempts = updates.processing_attempts;
    if (updates.processing_error !== undefined) updatePayload.processing_error = updates.processing_error;
    if (updates.processed_at !== undefined) updatePayload.processed_at = updates.processed_at;

    await supabaseAdmin
      .from("stripe_event_ledger")
      .update(updatePayload)
      .eq("id", ledgerId);
  }

  function isStaleEvent(event: Stripe.Event, company: CompanyRow): boolean {
    // If company has no billing_updated_at, process normally (first update)
    if (!company.billing_updated_at) {
      return false;
    }

    // Convert Stripe event.created (Unix timestamp in seconds) to Date
    const eventTimestamp = new Date(event.created * 1000);
    const companyBillingUpdatedAt = new Date(company.billing_updated_at);

    // Event is stale if it's strictly older than the company's last billing update
    return eventTimestamp < companyBillingUpdatedAt;
  }

  try {
    const eventType = event.type;
    console.log(JSON.stringify({
      fn: "stripe-webhook",
      checkpoint: "event_received",
      event_id: event.id,
      event_type: eventType,
    }));

    if (eventType === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const companyIdHint =
        (session.metadata?.company_id as string | undefined) ??
        (typeof session.client_reference_id === "string" ? session.client_reference_id : null);
      const stripeCustomerId = typeof session.customer === "string" ? session.customer : null;
      const stripeSubscriptionId = typeof session.subscription === "string" ? session.subscription : null;

      const company = await findCompany({ companyIdHint, stripeCustomerId });
      if (!company) {
        // Update ledger with error state
        await updateLedger(ledgerId, {
          processing_state: "error",
          processed_at: new Date().toISOString(),
          processing_error: "No company matched webhook event.",
        });
        console.error(JSON.stringify({
          fn: "stripe-webhook",
          code: "COMPANY_NOT_FOUND",
          event_id: event.id,
          event_type: eventType,
          company_id_hint: companyIdHint,
          has_stripe_customer_id: !!stripeCustomerId,
        }));
        return errorResponse(404, "COMPANY_NOT_FOUND", "No company matched webhook event.");
      }

      // Update ledger with company_id
      await updateLedger(ledgerId, {
        company_id: company.id,
      });

      // Check if event is stale (older than company's last billing update)
      if (isStaleEvent(event, company)) {
        console.log(JSON.stringify({
          fn: "stripe-webhook",
          checkpoint: "stale_event_skipped",
          event_id: event.id,
          event_type: eventType,
          company_id: company.id,
          event_created: new Date(event.created * 1000).toISOString(),
          company_billing_updated_at: company.billing_updated_at,
        }));
        await updateLedger(ledgerId, {
          processing_state: "ignored",
          processed_at: new Date().toISOString(),
          processing_error: "STALE_EVENT_SKIPPED",
        });
        return jsonResponse(200, {
          ok: true,
          code: "STALE_EVENT_SKIPPED",
          message: "Event is older than company's current billing state. Skipped to prevent overwriting newer data.",
        });
      }

      let subscriptionForLogging: Stripe.Subscription | null = null;
      let planFromSubscription: string | null = null;
      
      if (stripeSubscriptionId) {
        subscriptionForLogging = await stripe.subscriptions.retrieve(stripeSubscriptionId);
        planFromSubscription = subscriptionForLogging.metadata?.plan || null;
        await applySubscriptionSnapshot({
          company,
          subscription: subscriptionForLogging,
          stripeEventId: event.id,
          eventType: eventType,
        });
      } else {
        await updateCompany(
          company.id,
          {
            stripe_customer_id: stripeCustomerId || company.stripe_customer_id,
          },
          company,
          event.id,
          eventType,
        );
      }

      console.log(JSON.stringify({
        fn: "stripe-webhook",
        event_id: event.id,
        event_type: eventType,
        company_id: company.id,
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
      }));

      // Update ledger with success state
      await updateLedger(ledgerId, {
        processing_state: "success",
        processed_at: new Date().toISOString(),
        processing_error: null,
      });

      // Log checkout_completed product event (trusted backend source)
      // Insert directly into product_events since webhook has service_role and company_id
      try {
        await supabaseAdmin.from("product_events").insert({
          company_id: company.id,
          user_id: null, // Webhook event, no user context
          role: null,
          event_name: "checkout_completed",
          context: {
            stripe_customer_id: stripeCustomerId,
            stripe_subscription_id: stripeSubscriptionId,
            stripe_event_id: event.id,
            plan: planFromSubscription
          }
        });
      } catch (eventLogError) {
        // Don't fail webhook if event logging fails
        console.error(JSON.stringify({
          fn: "stripe-webhook",
          checkpoint: "checkout_completed_event_log_failed",
          company_id: company.id,
          error: eventLogError instanceof Error ? eventLogError.message : String(eventLogError)
        }));
      }

      return jsonResponse(200, { ok: true, code: "EVENT_PROCESSED", message: "Checkout event processed." });
    }

    if (
      eventType === "customer.subscription.created" ||
      eventType === "customer.subscription.updated" ||
      eventType === "customer.subscription.deleted"
    ) {
      const subscription = event.data.object as Stripe.Subscription;
      const stripeCustomerId =
        typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id || null;
      const companyIdHint = subscription.metadata?.company_id || null;

      const company = await findCompany({ companyIdHint, stripeCustomerId });
      if (!company) {
        // Update ledger with error state
        await updateLedger(ledgerId, {
          processing_state: "error",
          processed_at: new Date().toISOString(),
          processing_error: "No company matched subscription event.",
        });
        console.error(JSON.stringify({
          fn: "stripe-webhook",
          code: "COMPANY_NOT_FOUND",
          event_id: event.id,
          event_type: eventType,
          company_id_hint: companyIdHint,
          has_stripe_customer_id: !!stripeCustomerId,
        }));
        return errorResponse(404, "COMPANY_NOT_FOUND", "No company matched subscription event.");
      }

      // Update ledger with company_id
      await updateLedger(ledgerId, {
        company_id: company.id,
      });

      // Check if event is stale (older than company's last billing update)
      if (isStaleEvent(event, company)) {
        console.log(JSON.stringify({
          fn: "stripe-webhook",
          checkpoint: "stale_event_skipped",
          event_id: event.id,
          event_type: eventType,
          company_id: company.id,
          event_created: new Date(event.created * 1000).toISOString(),
          company_billing_updated_at: company.billing_updated_at,
        }));
        await updateLedger(ledgerId, {
          processing_state: "ignored",
          processed_at: new Date().toISOString(),
          processing_error: "STALE_EVENT_SKIPPED",
        });
        return jsonResponse(200, {
          ok: true,
          code: "STALE_EVENT_SKIPPED",
          message: "Event is older than company's current billing state. Skipped to prevent overwriting newer data.",
        });
      }

      await applySubscriptionSnapshot({
        company,
        subscription,
        forceStatus: eventType === "customer.subscription.deleted" ? "canceled" : undefined,
        stripeEventId: event.id,
        eventType: eventType,
      });

      console.log(JSON.stringify({
        fn: "stripe-webhook",
        event_id: event.id,
        event_type: eventType,
        company_id: company.id,
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: subscription.id,
      }));

      // Update ledger with success state
      await updateLedger(ledgerId, {
        processing_state: "success",
        processed_at: new Date().toISOString(),
        processing_error: null,
      });

      return jsonResponse(200, { ok: true, code: "EVENT_PROCESSED", message: "Subscription event processed." });
    }

    if (eventType === "invoice.payment_failed" || eventType === "invoice.payment_succeeded") {
      const invoice = event.data.object as Stripe.Invoice;
      const stripeCustomerId =
        typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id || null;
      const stripeSubscriptionId =
        typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id || null;

      const company = await findCompany({ stripeCustomerId });
      if (!company) {
        // Update ledger with error state
        await updateLedger(ledgerId, {
          processing_state: "error",
          processed_at: new Date().toISOString(),
          processing_error: "No company matched invoice event.",
        });
        console.error(JSON.stringify({
          fn: "stripe-webhook",
          code: "COMPANY_NOT_FOUND",
          event_id: event.id,
          event_type: eventType,
          has_stripe_customer_id: !!stripeCustomerId,
        }));
        return errorResponse(404, "COMPANY_NOT_FOUND", "No company matched invoice event.");
      }

      // Update ledger with company_id
      await updateLedger(ledgerId, {
        company_id: company.id,
      });

      // Check if event is stale (older than company's last billing update)
      if (isStaleEvent(event, company)) {
        console.log(JSON.stringify({
          fn: "stripe-webhook",
          checkpoint: "stale_event_skipped",
          event_id: event.id,
          event_type: eventType,
          company_id: company.id,
          event_created: new Date(event.created * 1000).toISOString(),
          company_billing_updated_at: company.billing_updated_at,
        }));
        await updateLedger(ledgerId, {
          processing_state: "ignored",
          processed_at: new Date().toISOString(),
          processing_error: "STALE_EVENT_SKIPPED",
        });
        return jsonResponse(200, {
          ok: true,
          code: "STALE_EVENT_SKIPPED",
          message: "Event is older than company's current billing state. Skipped to prevent overwriting newer data.",
        });
      }

      if (stripeSubscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
        await applySubscriptionSnapshot({
          company,
          subscription,
          forceStatus: eventType === "invoice.payment_failed" ? "past_due" : undefined,
          stripeEventId: event.id,
          eventType: eventType,
        });
      } else {
        await updateCompany(
          company.id,
          {
            stripe_customer_id: stripeCustomerId || company.stripe_customer_id,
            subscription_status: eventType === "invoice.payment_failed" ? "past_due" : "active",
            billing_grace_until: eventType === "invoice.payment_failed" ? buildGraceUntil(7) : null,
          },
          company,
          event.id,
          eventType,
        );
      }

      console.log(JSON.stringify({
        fn: "stripe-webhook",
        event_id: event.id,
        event_type: eventType,
        company_id: company.id,
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
      }));

      // Update ledger with success state
      await updateLedger(ledgerId, {
        processing_state: "success",
        processed_at: new Date().toISOString(),
        processing_error: null,
      });

      return jsonResponse(200, { ok: true, code: "EVENT_PROCESSED", message: "Invoice event processed." });
    }

    // Update ledger with ignored state
    await updateLedger(ledgerId, {
      processing_state: "ignored",
      processed_at: new Date().toISOString(),
    });

    return jsonResponse(200, {
      ok: true,
      code: "EVENT_IGNORED",
      message: `Event not handled: ${eventType}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error.";
    const errorMessage = message.length > 500 ? message.substring(0, 500) : message;

    // Update ledger with error state (only if event was claimed)
    if (ledgerId) {
      await updateLedger(ledgerId, {
        processing_state: "error",
        processed_at: new Date().toISOString(),
        processing_error: errorMessage,
      });
    }

    console.error(JSON.stringify({
      fn: "stripe-webhook",
      event_id: event.id,
      event_type: event.type,
      code: "INTERNAL_ERROR",
      message,
    }));
    return errorResponse(500, "INTERNAL_ERROR", message);
  }
});
