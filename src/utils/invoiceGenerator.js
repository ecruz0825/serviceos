// utils/invoiceGenerator.js
import jsPDF from "jspdf";

/**
 * generateInvoice(job)
 * Expects a single object with:
 *  - id, customer_name, customer_email
 *  - description, completed_at, amount, status, notes
 *  - before_image_url?, after_image_url?
 *  - company?: { name, address, phone, email, logo (signed URL from logo_path), website }
 *  - paid_amount? (number) for the "Paid / Remaining" box (optional)
 */
export async function generateInvoice(job = {}, opts = {}) {
  const company = {
    name: job.company?.name || "Your Company",
    address: job.company?.address || "",
    phone: job.company?.phone || "",
    email: job.company?.email || "",
    logo: job.company?.logo || "",
    website: job.company?.website || "",
  };

  const total = Number(job.amount ?? job.job_cost ?? 0);
  // Support both old paid_amount and new paidInfo structure
  const paidInfo = job.paidInfo || { totalPaid: Number(job.paid_amount ?? 0), payments: [] };
  const paid = paidInfo.totalPaid;
  const remaining = Math.max(0, total - paid);

  const doc = new jsPDF("p", "pt", "letter");

  // --- Helpers & constants
  const margin = 40;
  const lineH = 18;
  const gray = [100];
  const green = [34, 139, 34];

  const shortId = job.id ? String(job.id).substring(0, 6).toUpperCase() : "000000";
  const invoiceNumber = `INV-${new Date().getFullYear()}-${shortId}`;
  const invoiceDate = new Date().toLocaleDateString();
  const paymentTerms = "Due upon receipt";

  // Consider PAID if explicitly paid, or if status === completed and remaining <= 0
  const statusNorm = (job.status || "").toLowerCase();
  const isPaid = remaining <= 0 || statusNorm === "completed";
  const watermarkText = isPaid ? "PAID" : "UNPAID";

  // --- Outer border
  doc.setDrawColor(200);
  doc.setLineWidth(1);
  doc.rect(20, 20, doc.internal.pageSize.width - 40, doc.internal.pageSize.height - 40);

  // --- Watermark
  doc.setFontSize(90);
  doc.setTextColor(240);
  doc.text(watermarkText, 150, 400, { angle: 45 });
  doc.setTextColor(0);

  // --- Header: Logo + Company info
  if (company.logo) {
    try {
      const { dataUrl } = await loadImage(company.logo);
      doc.addImage(dataUrl, "PNG", margin, 30, 60, 60);
    } catch (e) {
      console.warn("Logo not loaded:", e);
    }
  }

  // --- Company text (wrapped to avoid overlap, tight vertical rhythm)
const textX = margin + 70;
let headY = 40;

doc.setFontSize(14).setFont("helvetica", "bold");
doc.text(company.name, textX, headY);

// Use a slightly smaller line height just for the header text
const headLH = 14;

doc.setFont("helvetica", "normal").setFontSize(11);
headY += headLH;

if (company.address) {
  const wrappedAddr = doc.splitTextToSize(company.address, 300);
  doc.text(wrappedAddr, textX, headY);
  // Advance by the actual printed height (prevents extra blank line)
  const { h } = doc.getTextDimensions(wrappedAddr);
  headY += h;
}

if (company.phone) {
  doc.text(`Phone: ${company.phone}`, textX, headY);
  headY += headLH;
}

if (company.email) {
  doc.text(`Email: ${company.email}`, textX, headY);
  headY += headLH;
}

  // Invoice title box
  doc.setDrawColor(...green).setLineWidth(2);
  doc.rect(420, 30, 150, 40);
  doc.setFont("helvetica", "bold").setFontSize(18);
  doc.text("INVOICE", 495, 55, { align: "center" });

  // Invoice meta
  // Invoice meta - start BELOW whatever header lines were printed
const yStart = Math.max(120, headY + lineH + 8); // bump 8px padding
let y = yStart;
  doc.setFont("helvetica", "bold").setFontSize(12);
  doc.text("Invoice #:", margin, y);
  doc.setFont("helvetica", "normal");
  doc.text(invoiceNumber, margin + 90, y);

  doc.setFont("helvetica", "bold");
  doc.text("Date:", 420, y);
  doc.setFont("helvetica", "normal");
  doc.text(invoiceDate, 470, y);

  y += lineH;
  doc.setFont("helvetica", "bold");
  doc.text("Terms:", margin, y);
  doc.setFont("helvetica", "normal");
  doc.text(paymentTerms, margin + 90, y);

  // Bill To
  y += 30;
  doc.setFont("helvetica", "bold").setFontSize(13);
  doc.text("Bill To:", margin, y);

  doc.setFont("helvetica", "normal").setFontSize(12);
  y += lineH;
  if (job.customer_name) doc.text(job.customer_name, margin, y);
  y += lineH;
  if (job.customer_email) doc.text(`Email: ${job.customer_email}`, margin, y);

  // Job details box
  y += 20;
  const boxWidth = 520;
  doc.setDrawColor(200).setLineWidth(1);
  doc.rect(margin, y, boxWidth, 170);

  let detailY = y + 20;
  const details = [
    { label: "Service", value: job.description || "" },
    { label: "Date", value: formatDate(job.completed_at) },
    { label: "Status", value: job.status || "" },
    { label: "Cost", value: `$${total.toFixed(2)}` },
    { label: "Notes", value: job.notes || "" },
  ];

  details.forEach(({ label, value }) => {
    doc.setFont("helvetica", "bold").setTextColor(...gray);
    doc.text(`${label}:`, margin + 10, detailY);
    doc.setFont("helvetica", "normal").setTextColor(0);

    const wrapped = doc.splitTextToSize(String(value || ""), boxWidth - 130);
    doc.text(wrapped, margin + 110, detailY);
    // Advance by the number of wrapped lines
    const lines = Array.isArray(wrapped) ? wrapped.length : 1;
    detailY += lineH * Math.max(lines, 1);
  });

  // Payment summary
  const payTop = y + 190;
  doc.setDrawColor(...green).setFillColor(245);
  doc.rect(margin, payTop, boxWidth, 70, "FD");
  doc.setFont("helvetica", "bold").setFontSize(14);
  doc.text("Payment Summary", margin + 10, payTop + 20);
  doc.setFont("helvetica", "normal").setFontSize(12);
  doc.text(`Total: $${total.toFixed(2)}`, margin + 10, payTop + 40);
  doc.text(`Paid: $${paid.toFixed(2)}`, margin + 150, payTop + 40);
  doc.text(`Remaining: $${remaining.toFixed(2)}`, margin + 250, payTop + 40);

  // Payments section - list individual payment records
  let paymentsY = payTop + 100;
  if (paidInfo.payments && paidInfo.payments.length > 0) {
    doc.setFont("helvetica", "bold").setFontSize(12);
    doc.setTextColor(0);
    doc.text("Payments:", margin, paymentsY);
    paymentsY += lineH + 5;
    
    doc.setFont("helvetica", "normal").setFontSize(10);
    paidInfo.payments.forEach((payment) => {
      const paymentDate = payment.paid_at 
        ? formatDate(payment.paid_at)
        : (payment.date_paid || '-');
      const receiptNum = payment.receipt_number || '-';
      const externalRef = payment.external_ref || '-';
      const method = payment.payment_method || 'Unknown';
      const amount = Number(payment.amount || 0).toFixed(2);
      const receivedBy = payment.received_by_name || '-';
      
      // Format: Date | Method | Amount | Receipt | Ref | Received By
      const paymentLine = `${paymentDate} | ${method} | $${amount} | Receipt: ${receiptNum} | Ref: ${externalRef} | Received By: ${receivedBy}`;
      const wrapped = doc.splitTextToSize(paymentLine, boxWidth - 20);
      doc.text(wrapped, margin + 10, paymentsY);
      const lines = Array.isArray(wrapped) ? wrapped.length : 1;
      paymentsY += lineH * Math.max(lines, 1);
    });
  } else {
    doc.setFont("helvetica", "normal").setFontSize(10);
    doc.setTextColor(...gray);
    doc.text("No payments recorded.", margin + 10, paymentsY);
    paymentsY += lineH;
  }

  // Images (keep aspect ratio, fit into 220x130)
  // Adjust image Y position based on payments section height
  let imgY = paymentsY + 20;
  const maxW = 220;
  const maxH = 130;

  if (job.before_image_url) {
    try {
      const { dataUrl, w, h } = await loadImage(job.before_image_url);
      const { outW, outH } = fitWithin(w, h, maxW, maxH);
      doc.setFont("helvetica", "bold");
      doc.text("Before:", margin, imgY);
      doc.addImage(dataUrl, "JPEG", margin, imgY + 10, outW, outH);
    } catch (e) {
      console.warn("Before image error:", e);
    }
  }

  if (job.after_image_url) {
    try {
      const { dataUrl, w, h } = await loadImage(job.after_image_url);
      const { outW, outH } = fitWithin(w, h, maxW, maxH);
      doc.setFont("helvetica", "bold");
      doc.text("After:", margin + 280, imgY);
      doc.addImage(dataUrl, "JPEG", margin + 280, imgY + 10, outW, outH);
    } catch (e) {
      console.warn("After image error:", e);
    }
  }

  // Footer
  const pageH = doc.internal.pageSize.height;
  doc.setFontSize(10).setFont("helvetica", "italic").setTextColor(...gray);
  const footer = `Thank you for your business!${company.website ? " | " + company.website : ""}`;
  doc.text(footer, margin, pageH - 30);

  if (opts?.mode === "blob") {
  const blob = doc.output("blob");
  const filename = `invoice_${shortId}.pdf`;
  return { blob, filename, invoiceNumber };
} else {
  doc.save(`invoice_${shortId}.pdf`);
}
}
/* ---------- helpers ---------- */

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString();
}

function fitWithin(w, h, maxW, maxH) {
  const r = Math.min(maxW / w, maxH / h);
  return { outW: Math.round(w * r), outH: Math.round(h * r) };
}

async function loadImage(url) {
  const res = await fetch(url);
  const blob = await res.blob();

  const dataUrl = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });

  const dims = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = reject;
    img.src = dataUrl;
  });

  return { dataUrl, ...dims };
}