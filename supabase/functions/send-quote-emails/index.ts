// supabase/functions/send-quote-emails/index.ts
//
// Universal Transactional Email Sender
// =====================================
// This edge function processes the email queue (quote_messages table) and sends
// emails via Resend. It supports multiple message types while maintaining full
// backward compatibility with the original quote-only implementation.
//
// NOTE: Filename kept as 'send-quote-emails' to avoid breaking existing invocations.
// The function now handles all transactional email types via message_type dispatch.
//
// =============================================================================
// REQUIRED ENVIRONMENT VARIABLES
// =============================================================================
//
// EMAIL_SENDING_ENABLED (required)
//   Must be exactly "true" to enable actual email sending via Resend.
//   Any other value (including unset) will cause messages to be marked as failed
//   with error "Email sending disabled by configuration".
//
// RESEND_API_KEY (required when EMAIL_SENDING_ENABLED=true)
//   Your Resend API key.
//
// EMAIL_FROM (required when EMAIL_SENDING_ENABLED=true)
//   Sender address, e.g., "Company Name <noreply@yourdomain.com>"
//   Falls back to RESEND_FROM for backward compatibility.
//
// EMAIL_REPLY_TO (optional)
//   Reply-to address for emails.
//
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-set by Supabase)
//
// =============================================================================
// BEHAVIOR WHEN SENDING IS DISABLED
// =============================================================================
// When EMAIL_SENDING_ENABLED != "true":
// - Messages are processed and marked as 'failed'
// - Error: "Email sending disabled by configuration (EMAIL_SENDING_ENABLED != 'true')"
// - retry_count is NOT incremented (this is a config issue, not a transient failure)
// - This provides clear visibility that emails are not being sent
// - Prevents silent queue buildup that could cause surprise sends later
//
// =============================================================================
// ERROR FIELD HANDLING
// =============================================================================
// The queue has two error fields for backward compatibility:
// - `error`: Legacy field (kept for existing quote UI compatibility)
// - `error_message`: Canonical field for the generic email system
// Both fields are written to on failure and cleared on success.
// New code should read `error_message`. Legacy code reading `error` will still work.
//
// =============================================================================
// SUPPORTED MESSAGE TYPES
// =============================================================================
// - quote: Quote emails with PDF generation (original behavior)
// - invoice_delivery: Invoice emails with status update
// - payment_receipt: Payment confirmation emails
// - collection: Collection/overdue reminder emails
// - job_completed: Job completion notifications to customer
// - crew_assignment: Crew job assignment notifications
// - schedule_request: Schedule request notifications
// - generic: Simple emails using subject/html_content/text_content

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.43.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// =============================================================================
// Type Definitions
// =============================================================================

type MessageType = 
  | 'quote' 
  | 'invoice_delivery' 
  | 'payment_receipt' 
  | 'collection'
  | 'job_completed' 
  | 'crew_assignment' 
  | 'schedule_request'
  | 'generic';

interface EmailMessage {
  id: string;
  company_id: string;
  message_type: MessageType;
  quote_id: string | null;
  job_id: string | null;
  invoice_id: string | null;
  customer_id: string | null;
  crew_member_id: string | null;
  to_email: string;
  subject: string;
  body: string | null;
  payload: Record<string, unknown>;
  html_content: string | null;
  text_content: string | null;
  retry_count: number;
}

interface Quote {
  id: string;
  quote_number: string;
  customer_id: string;
  services: any[];
  subtotal: number;
  tax: number;
  total: number;
  valid_until: string | null;
  notes: string | null;
  status: string;
  sent_at: string | null;
  created_at: string;
}

interface Customer {
  id: string;
  full_name: string | null;
  email: string | null;
  address: string | null;
  phone: string | null;
}

interface Company {
  id: string;
  name: string | null;
  display_name: string | null;
  address: string | null;
  support_phone: string | null;
  support_email: string | null;
  logo_path: string | null;
}

interface EmailContent {
  subject: string;
  html: string;
  text?: string;
}

interface ProcessResult {
  success: boolean;
  error?: string;
}

// =============================================================================
// Environment Configuration
// =============================================================================

interface EmailConfig {
  resendApiKey: string;
  fromAddress: string;
  replyTo: string | null;
  projectUrl: string;
  serviceRoleKey: string;
  sendingEnabled: boolean;
}

/**
 * Parses environment configuration for email sending.
 * 
 * Required env vars:
 * - RESEND_API_KEY: Resend API key
 * - EMAIL_FROM (or RESEND_FROM): Sender address
 * - EMAIL_SENDING_ENABLED: Must be "true" to enable actual sending
 * 
 * Optional env vars:
 * - EMAIL_REPLY_TO: Reply-to address
 * 
 * Behavior when EMAIL_SENDING_ENABLED != "true":
 * - Messages are marked as 'failed' with error "Email sending disabled by configuration"
 * - This provides clear visibility that emails are not being sent
 * - Prevents silent queue buildup that could cause surprise sends later
 */
function getEmailConfig(): EmailConfig | { error: string } {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  // Support both EMAIL_FROM (new) and RESEND_FROM (legacy) for backward compatibility
  const fromAddress = Deno.env.get("EMAIL_FROM") || Deno.env.get("RESEND_FROM") || "";
  const replyTo = Deno.env.get("EMAIL_REPLY_TO") || null;
  const projectUrl = Deno.env.get("SUPABASE_URL") || Deno.env.get("PROJECT_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY") || "";
  
  // Explicit opt-in for email sending - no heuristics, no fuzzy matching
  const sendingEnabledRaw = Deno.env.get("EMAIL_SENDING_ENABLED") || "";
  const sendingEnabled = sendingEnabledRaw.toLowerCase() === "true";

  if (!projectUrl || !serviceRoleKey) {
    return { error: "Supabase configuration missing (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)" };
  }

  // Only require RESEND_API_KEY and EMAIL_FROM when sending is enabled
  if (sendingEnabled) {
    if (!resendApiKey) {
      return { error: "RESEND_API_KEY environment variable not set (required when EMAIL_SENDING_ENABLED=true)" };
    }
    if (!fromAddress) {
      return { error: "EMAIL_FROM (or RESEND_FROM) environment variable not set (required when EMAIL_SENDING_ENABLED=true)" };
    }
  }

  return {
    resendApiKey: resendApiKey || "",
    fromAddress: fromAddress || "",
    replyTo,
    projectUrl,
    serviceRoleKey,
    sendingEnabled,
  };
}

// =============================================================================
// Message Type Handlers
// =============================================================================

async function processQuoteEmail(
  message: EmailMessage,
  supabase: SupabaseClient,
  config: EmailConfig
): Promise<EmailContent> {
  if (!message.quote_id) {
    throw new Error("Quote email requires quote_id");
  }

  // Fetch quote
  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .select("id, quote_number, customer_id, services, subtotal, tax, total, valid_until, notes, status, sent_at, created_at")
    .eq("id", message.quote_id)
    .single();

  if (quoteError || !quote) {
    throw new Error(`Quote not found: ${quoteError?.message || "Unknown error"}`);
  }

  const quoteData = quote as Quote;

  // Fetch customer
  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id, full_name, email, address, phone")
    .eq("id", quoteData.customer_id)
    .single();

  if (customerError || !customer) {
    throw new Error(`Customer not found: ${customerError?.message || "Unknown error"}`);
  }

  // Fetch company
  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, name, display_name, address, support_phone, support_email, logo_path")
    .eq("id", message.company_id)
    .single();

  if (companyError || !company) {
    throw new Error(`Company not found: ${companyError?.message || "Unknown error"}`);
  }

  // Generate PDF using jsPDF
  const { default: JsPDF } = await import("https://esm.sh/jspdf@2.5.1");
  const doc = new JsPDF("p", "pt", "letter");
  
  const margin = 40;
  const lineH = 16;
  let y = 40;
  
  // Header
  doc.setFontSize(24).setFont("helvetica", "bold");
  doc.text("QUOTE", margin, y);
  y += lineH * 2;
  
  doc.setFontSize(10).setFont("helvetica", "normal");
  doc.setFont("helvetica", "bold");
  doc.text("Quote #:", margin, y);
  doc.setFont("helvetica", "normal");
  doc.text(quoteData.quote_number, margin + 70, y);
  y += lineH;
  
  // Company info
  const companyName = (company as Company).display_name || (company as Company).name || "Your Company";
  doc.setFontSize(16).setFont("helvetica", "bold");
  doc.text(companyName, margin, y);
  y += lineH * 2;
  
  // Customer info
  const customerName = (customer as Customer).full_name || "Customer";
  doc.setFontSize(11).setFont("helvetica", "bold");
  doc.text("BILL TO", margin, y);
  y += lineH;
  doc.setFont("helvetica", "normal").setFontSize(10);
  doc.text(customerName, margin, y);
  y += lineH * 2;
  
  // Services table header
  doc.setFillColor(240, 240, 240);
  doc.rect(margin, y, 500, lineH * 1.8, 'F');
  doc.setFont("helvetica", "bold").setFontSize(10);
  doc.text("Description", margin + 8, y + lineH * 1.2);
  doc.text("Amount", margin + 400, y + lineH * 1.2, { align: 'right' });
  y += lineH * 1.8;
  
  // Services rows
  doc.setFont("helvetica", "normal").setFontSize(10);
  quoteData.services.forEach((service: any) => {
    const serviceName = (service.name || '').trim() || '—';
    const qty = Math.max(0, parseFloat(service.qty) || 0);
    const rate = Math.max(0, parseFloat(service.rate) || 0);
    const lineTotal = qty * rate;
    
    doc.text(serviceName, margin + 8, y);
    doc.text(`$${lineTotal.toFixed(2)}`, margin + 492, y, { align: 'right' });
    y += lineH * 1.4;
  });
  
  y += lineH;
  
  // Totals
  doc.setFont("helvetica", "normal").setFontSize(10);
  doc.text("Subtotal:", margin + 400, y, { align: 'right' });
  doc.text(`$${(quoteData.subtotal || 0).toFixed(2)}`, margin + 492, y, { align: 'right' });
  y += lineH;
  
  if (quoteData.tax > 0) {
    doc.text("Tax:", margin + 400, y, { align: 'right' });
    doc.text(`$${(quoteData.tax || 0).toFixed(2)}`, margin + 492, y, { align: 'right' });
    y += lineH;
  }
  
  doc.setFont("helvetica", "bold").setFontSize(12);
  doc.text("Total:", margin + 400, y, { align: 'right' });
  doc.text(`$${(quoteData.total || 0).toFixed(2)}`, margin + 492, y, { align: 'right' });
  
  // Upload PDF to storage
  const pdfArrayBuffer = doc.output('arraybuffer');
  const pdfBlob = new Blob([pdfArrayBuffer], { type: 'application/pdf' });
  
  const pdfPath = `${(company as Company).id}/${quoteData.id}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from("quote-pdfs")
    .upload(pdfPath, pdfBlob, {
      contentType: "application/pdf",
      upsert: true
    });

  if (uploadError) {
    throw new Error(`PDF upload failed: ${uploadError.message}`);
  }

  // Generate signed URL (1 hour expiry)
  const { data: signedUrlData, error: signedUrlError } = await supabase.storage
    .from("quote-pdfs")
    .createSignedUrl(pdfPath, 60 * 60);

  if (signedUrlError || !signedUrlData?.signedUrl) {
    throw new Error(`Failed to generate signed URL: ${signedUrlError?.message || "Unknown error"}`);
  }

  const pdfUrl = signedUrlData.signedUrl;
  const quoteTotal = (quoteData.total || 0).toFixed(2);
  const quoteNumber = quoteData.quote_number;
  
  // Build HTML content
  let emailBody = message.body || "";
  emailBody = emailBody.replace(/\n/g, "<br>");
  
  const pdfLinkHtml = `<div style="margin: 20px 0; padding: 15px; background-color: #f0f0f0; border-radius: 5px;">
    <p style="margin: 0 0 10px 0; font-weight: bold;">Quote Details:</p>
    <p style="margin: 5px 0;">Quote Number: <strong>${quoteNumber}</strong></p>
    <p style="margin: 5px 0;">Total Amount: <strong>$${quoteTotal}</strong></p>
    <p style="margin: 15px 0 10px 0;">
      <a href="${pdfUrl}" style="display: inline-block; padding: 10px 20px; background-color: #22c55e; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">Download Quote PDF</a>
    </p>
  </div>`;

  // Update quote status after successful processing
  try {
    const { data: existingQuote } = await supabase
      .from("quotes")
      .select("sent_at")
      .eq("id", message.quote_id)
      .single();

    const updateData: { status: string; sent_at?: string } = { status: "sent" };
    if (!existingQuote?.sent_at) {
      updateData.sent_at = new Date().toISOString();
    }

    await supabase
      .from("quotes")
      .update(updateData)
      .eq("id", message.quote_id);
  } catch (err) {
    console.warn(`Failed to update quote status for ${message.quote_id}:`, err);
  }

  return {
    subject: message.subject,
    html: emailBody + pdfLinkHtml,
    text: message.body || undefined,
  };
}

async function processGenericEmail(message: EmailMessage): Promise<EmailContent> {
  // For generic/simple emails, use pre-rendered content or payload
  let html = message.html_content || "";
  let text = message.text_content || message.body || "";

  // If no HTML content but we have text/body, convert to simple HTML
  if (!html && text) {
    html = `<div style="font-family: sans-serif; line-height: 1.6;">${text.replace(/\n/g, "<br>")}</div>`;
  }

  // Simple placeholder replacement from payload
  const payload = message.payload || {};
  for (const [key, value] of Object.entries(payload)) {
    if (typeof value === 'string' || typeof value === 'number') {
      const placeholder = new RegExp(`{{${key}}}`, 'g');
      html = html.replace(placeholder, String(value));
      text = text.replace(placeholder, String(value));
    }
  }

  if (!html && !text) {
    throw new Error("Email must have html_content, text_content, or body");
  }

  return {
    subject: message.subject,
    html,
    text: text || undefined,
  };
}

async function processScheduleRequestEmail(message: EmailMessage): Promise<EmailContent> {
  // Schedule request emails use the body/subject directly (already formatted by RPC)
  return processGenericEmail(message);
}

/**
 * Process invoice delivery email.
 * 
 * Uses pre-rendered content from frontend (html_content, text_content, subject).
 * After successful send, updates invoice status via send_invoice RPC.
 * 
 * Expected payload fields (informational, used by frontend to build content):
 * - invoice_id: UUID of the invoice
 * - invoice_number: Invoice number for display
 * - invoice_total: Total amount
 * - balance_due: Balance remaining
 * - due_date: Due date formatted for display
 * - pdf_url: Signed URL to invoice PDF
 * - customer_name: Customer name
 * - service_description: Service description
 * - brand_name: Company brand name
 */
async function processInvoiceDeliveryEmail(
  message: EmailMessage,
  supabase: SupabaseClient
): Promise<EmailContent> {
  // Invoice emails should have pre-rendered content from frontend
  if (!message.html_content && !message.text_content && !message.body) {
    throw new Error("Invoice delivery email requires html_content, text_content, or body");
  }

  // Use generic processing for the content (frontend provides it)
  const content = await processGenericEmail(message);

  // After content is prepared, update invoice status if invoice_id is available
  const invoiceId = message.invoice_id || (message.payload as Record<string, unknown>)?.invoice_id;
  if (invoiceId) {
    try {
      // Call send_invoice RPC to mark invoice as sent
      // This sets status='sent' and sent_at=now() in the invoice record
      const { error: invoiceError } = await supabase.rpc('send_invoice', {
        p_invoice_id: invoiceId,
        p_pdf_path: null, // Already set
        p_due_date: null, // Already set
      });

      if (invoiceError) {
        // Log but don't fail the email - invoice status is secondary
        console.warn(`Failed to update invoice ${invoiceId} status:`, invoiceError.message);
      } else {
        console.log(`Invoice ${invoiceId} marked as sent`);
      }
    } catch (err) {
      console.warn(`Error updating invoice ${invoiceId} status:`, err);
    }
  }

  return content;
}

async function processMessageByType(
  message: EmailMessage,
  supabase: SupabaseClient,
  config: EmailConfig
): Promise<EmailContent> {
  const messageType = message.message_type || 'quote';

  switch (messageType) {
    case 'quote':
      return processQuoteEmail(message, supabase, config);

    case 'schedule_request':
      return processScheduleRequestEmail(message);

    case 'invoice_delivery':
      return processInvoiceDeliveryEmail(message, supabase);

    case 'payment_receipt':
      // Payment receipts use pre-rendered content from frontend
      // No additional database updates needed (payment is already recorded)
      return processGenericEmail(message);

    case 'collection':
      // Collection/reminder emails use pre-rendered content from frontend
      // Communication logging is handled by frontend via log_collection_communication RPC
      return processGenericEmail(message);

    case 'job_completed':
      // Job completion emails use pre-rendered content from frontend
      // Customer is notified when their job is marked complete
      return processGenericEmail(message);

    case 'crew_assignment':
      // Crew assignment emails use pre-rendered content from frontend
      // Crew members are notified when assigned to a job
      return processGenericEmail(message);

    case 'generic':
    default:
      return processGenericEmail(message);
  }
}

// =============================================================================
// Email Sending
// =============================================================================

async function sendViaResend(
  to: string,
  content: EmailContent,
  config: EmailConfig
): Promise<ProcessResult> {
  const payload: Record<string, unknown> = {
    from: config.fromAddress,
    to,
    subject: content.subject,
    html: content.html,
  };

  if (content.text) {
    payload.text = content.text;
  }

  if (config.replyTo) {
    payload.reply_to = config.replyTo;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    return {
      success: false,
      error: `Resend API error: ${response.status} - ${JSON.stringify(errorData)}`,
    };
  }

  return { success: true };
}

async function markMessageProcessing(
  supabase: SupabaseClient,
  messageId: string
): Promise<boolean> {
  const { error } = await supabase
    .from("quote_messages")
    .update({ status: "processing" })
    .eq("id", messageId)
    .eq("status", "queued");

  return !error;
}

/**
 * Marks a message as successfully sent.
 * 
 * Clears both error fields for backward compatibility:
 * - `error`: Legacy field (kept for existing quote UI compatibility)
 * - `error_message`: Canonical field for new generic email system
 */
async function markMessageSent(
  supabase: SupabaseClient,
  messageId: string
): Promise<void> {
  const now = new Date().toISOString();
  await supabase
    .from("quote_messages")
    .update({
      status: "sent",
      sent_at: now,
      // Clear both error fields for backward compatibility
      error: null,         // Legacy field
      error_message: null, // Canonical field
    })
    .eq("id", messageId);
}

/**
 * Marks a message as failed.
 * 
 * Writes to both error fields for backward compatibility:
 * - `error`: Legacy field (kept for existing quote flows, will be deprecated)
 * - `error_message`: Canonical field for new generic email system (use this going forward)
 * 
 * @param incrementRetry - If true, increments retry_count. Set false for config errors
 *                         that won't resolve on retry (e.g., sending disabled).
 */
async function markMessageFailed(
  supabase: SupabaseClient,
  messageId: string,
  errorMsg: string,
  retryCount: number,
  incrementRetry: boolean = true
): Promise<void> {
  const now = new Date().toISOString();
  await supabase
    .from("quote_messages")
    .update({
      status: "failed",
      // Write to both fields for backward compatibility
      error: errorMsg,         // Legacy field (deprecated, kept for existing code)
      error_message: errorMsg, // Canonical field (use this going forward)
      retry_count: incrementRetry ? retryCount + 1 : retryCount,
      last_retry_at: now,
    })
    .eq("id", messageId);
}

// =============================================================================
// Main Handler
// =============================================================================

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Parse optional request body for filtering
    let messageTypeFilter: string | null = null;
    let limitOverride: number | null = null;
    
    try {
      if (req.method === "POST") {
        const body = await req.json();
        messageTypeFilter = body.message_type || null;
        limitOverride = body.limit || null;
      }
    } catch {
      // No body or invalid JSON - use defaults
    }

    // Get configuration
    const configResult = getEmailConfig();
    if ('error' in configResult) {
      return new Response(
        JSON.stringify({ error: configResult.error }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const config = configResult;

    // Create Supabase client
    const supabase = createClient(config.projectUrl, config.serviceRoleKey, {
      auth: { persistSession: false },
    });

    // Build query for queued messages
    let query = supabase
      .from("quote_messages")
      .select("id, company_id, message_type, quote_id, job_id, invoice_id, customer_id, crew_member_id, to_email, subject, body, payload, html_content, text_content, retry_count")
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(limitOverride || 10);

    // Apply message type filter if specified
    if (messageTypeFilter) {
      query = query.eq("message_type", messageTypeFilter);
    }

    const { data: messages, error: messagesError } = await query;

    if (messagesError) {
      console.error("Error fetching queued messages:", messagesError);
      return new Response(
        JSON.stringify({ error: messagesError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!messages || messages.length === 0) {
      return new Response(
        JSON.stringify({
          ok: true,
          sending_enabled: config.sendingEnabled,
          processed: 0,
          sent: 0,
          failed: 0,
          message: "No queued messages",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let sentCount = 0;
    let failedCount = 0;
    const results: Array<{ id: string; status: string; type: string; error?: string }> = [];

    // When sending is disabled, mark all messages as failed with clear error
    // This prevents silent queue buildup and makes the disabled state visible
    if (!config.sendingEnabled) {
      const disabledError = "Email sending disabled by configuration (EMAIL_SENDING_ENABLED != 'true')";
      console.log(`[SENDING DISABLED] Processing ${messages.length} messages as failed`);
      
      for (const message of messages as EmailMessage[]) {
        const messageType = message.message_type || 'quote';
        
        // Mark as processing first (for consistency)
        const acquired = await markMessageProcessing(supabase, message.id);
        if (!acquired) {
          console.log(`Message ${message.id} already being processed, skipping`);
          continue;
        }
        
        // Mark as failed with clear error - don't increment retry count since this is config issue
        await markMessageFailed(supabase, message.id, disabledError, message.retry_count, false);
        failedCount++;
        results.push({ id: message.id, status: "failed", type: messageType, error: disabledError });
      }
      
      return new Response(
        JSON.stringify({
          ok: true,
          sending_enabled: false,
          processed: messages.length,
          sent: 0,
          failed: failedCount,
          message: "Email sending is disabled. Set EMAIL_SENDING_ENABLED=true to enable.",
          results,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normal processing when sending is enabled
    for (const message of messages as EmailMessage[]) {
      const messageType = message.message_type || 'quote';
      
      try {
        // Mark as processing (optimistic lock)
        const acquired = await markMessageProcessing(supabase, message.id);
        if (!acquired) {
          console.log(`Message ${message.id} already being processed, skipping`);
          continue;
        }

        // Process message based on type
        const content = await processMessageByType(message, supabase, config);

        // Send via Resend
        const sendResult = await sendViaResend(message.to_email, content, config);

        if (sendResult.success) {
          await markMessageSent(supabase, message.id);
          sentCount++;
          results.push({ id: message.id, status: "sent", type: messageType });
        } else {
          await markMessageFailed(supabase, message.id, sendResult.error || "Unknown error", message.retry_count, true);
          failedCount++;
          results.push({ id: message.id, status: "failed", type: messageType, error: sendResult.error });
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`Error processing message ${message.id} (${messageType}):`, errorMsg);
        
        await markMessageFailed(supabase, message.id, errorMsg, message.retry_count, true);
        failedCount++;
        results.push({ id: message.id, status: "failed", type: messageType, error: errorMsg });
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        sending_enabled: true,
        processed: messages.length,
        sent: sentCount,
        failed: failedCount,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error in email processor:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

