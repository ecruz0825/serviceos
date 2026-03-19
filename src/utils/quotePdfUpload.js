// utils/quotePdfUpload.js
import { buildQuotePdfDoc } from "./quotePdf";

/**
 * uploadQuotePdfAndGetSignedUrl({ supabase, quote, customer, company })
 * Generates a quote PDF, uploads it to Supabase Storage, and returns a signed URL
 * 
 * @param {Object} params
 * @param {Object} params.supabase - Supabase client instance
 * @param {Object} params.quote - Quote object
 * @param {Object} params.customer - Customer object
 * @param {Object} params.company - Company object
 * @returns {Promise<string>} Signed URL to the uploaded PDF (valid for 1 hour)
 */
export async function uploadQuotePdfAndGetSignedUrl({ supabase, quote, customer, company }) {
  if (!supabase) throw new Error("uploadQuotePdfAndGetSignedUrl: supabase client required");
  if (!quote?.id) throw new Error("uploadQuotePdfAndGetSignedUrl: quote.id required");
  if (!company?.id) throw new Error("uploadQuotePdfAndGetSignedUrl: company.id required");

  // Build PDF document (without saving)
  const doc = await buildQuotePdfDoc(quote, customer, company, supabase);

  // Convert to blob
  const blob = doc.output('blob');

  // Upload path: {company_id}/{quote_id}.pdf
  const path = `${company.id}/${quote.id}.pdf`;
  const bucketName = "quote-pdfs";

  // Upload to storage
  const { error: uploadError } = await supabase.storage
    .from(bucketName)
    .upload(path, blob, {
      contentType: "application/pdf",
      upsert: true
    });

  if (uploadError) {
    console.error("Quote PDF upload failed:", {
      error: uploadError.message,
      code: uploadError.statusCode,
      path,
      bucketName,
      companyId: company.id,
      quoteId: quote.id
    });
    throw uploadError;
  }

  // Generate signed URL (1 hour expiry)
  const { data: signedUrlData, error: signedUrlError } = await supabase.storage
    .from(bucketName)
    .createSignedUrl(path, 60 * 60); // 1 hour

  if (signedUrlError || !signedUrlData?.signedUrl) {
    console.error("Failed to generate signed URL for quote PDF:", signedUrlError);
    throw new Error(signedUrlError?.message || "Failed to generate signed URL");
  }

  return signedUrlData.signedUrl;
}

