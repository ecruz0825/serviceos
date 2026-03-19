import { supabase } from "../supabaseClient";

export async function uploadInvoicePdf({ companyId, jobId, filename, blob }) {
  if (!blob) throw new Error("uploadInvoicePdf: missing blob");
  if (!companyId) throw new Error("uploadInvoicePdf: missing companyId");
  if (!jobId) throw new Error("uploadInvoicePdf: missing jobId");

  const path = `${companyId}/${jobId}/${filename}`;
  const bucketName = "invoices";

  const { error } = await supabase
    .storage
    .from(bucketName)
    .upload(path, blob, { contentType: "application/pdf", upsert: true });

  if (error) {
    console.error("Invoice upload failed:", {
      error: error.message,
      code: error.statusCode,
      path,
      bucketName,
      companyId,
      jobId,
      filename
    });
    throw error;
  }

  const { data } = supabase.storage.from("invoices").getPublicUrl(path);
  return { publicUrl: data.publicUrl, path };
}
