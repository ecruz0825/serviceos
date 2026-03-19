import { supabase } from "../supabaseClient";

/**
 * Get a signed URL for an invoice PDF from private storage.
 * @param {Object} params - Parameters object
 * @param {string} params.invoice_path - Path to the invoice file (format: companyId/jobId/...pdf)
 * @param {number} [params.expiresIn] - Expiration time in seconds (default: 7 days)
 * @returns {Promise<string>} The signed URL
 * @throws {Error} If invoice_path is invalid or the edge function call fails
 */
export async function getSignedInvoiceUrl({ invoice_path, expiresIn }) {
  // Validate invoice_path
  if (!invoice_path || typeof invoice_path !== "string" || invoice_path.trim() === "") {
    throw new Error("invoice_path must be a non-empty string");
  }

  // Default expiration: 7 days (60 * 60 * 24 * 7 seconds)
  const expiresInSeconds = expiresIn ?? 60 * 60 * 24 * 7;

  // Call the Supabase Edge Function
  const { data, error } = await supabase.functions.invoke("signed-invoice-url", {
    body: {
      path: invoice_path,
      expiresIn: expiresInSeconds,
    },
  });

  // Handle errors from the edge function
  if (error) {
    throw new Error(`SIGNED_URL_FAILED: ${error.message || JSON.stringify(error)}`);
  }

  // Check if response data is valid
  if (!data || typeof data !== "object") {
    throw new Error("SIGNED_URL_FAILED: Invalid response from edge function");
  }

  // Extract and return the URL
  if (!data.url) {
    throw new Error(`SIGNED_URL_FAILED: Response missing 'url' field. Received: ${JSON.stringify(data)}`);
  }

  return data.url;
}

