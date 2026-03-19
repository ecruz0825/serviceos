// utils/quotePdf.js
import jsPDF from "jspdf";
import { supabase } from "../supabaseClient";

/**
 * buildQuotePdfDoc(quote, customer, company)
 * Builds a jsPDF document for a quote (returns doc, does not save)
 * 
 * @param {Object} quote - Quote object with: quote_number, created_at, valid_until, status, services, subtotal, tax, total, notes
 * @param {Object} customer - Customer object with: full_name, name, address, phone, email
 * @param {Object} company - Company object with: display_name, name, address, support_phone, support_email, logo_path
 * @param {Object} supabaseClient - Optional Supabase client (for logo signed URLs). If not provided, uses default.
 * @returns {Promise<jsPDF>} The built jsPDF document
 */
export async function buildQuotePdfDoc(quote = {}, customer = {}, company = {}, supabaseClient = null) {
  // Validate required fields
  if (!quote.quote_number) {
    throw new Error('Quote number is required');
  }
  if (!quote.services || !Array.isArray(quote.services) || quote.services.length === 0) {
    throw new Error('Quote must have at least one service');
  }

  // Use provided client or default
  const client = supabaseClient || supabase;

  // Formatting utilities
  const formatMoney = (amount) => {
    const num = Math.max(0, parseFloat(amount) || 0);
    return `$${num.toFixed(2)}`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return '—';
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return '—';
    }
  };

  // Helper: Get signed URL from logo_path only
  let logoUrl = null;
  if (company && company.logo_path) {
    try {
      // Get signed URL for logo_path from branding bucket
      const { data: signedUrlData, error: signedUrlError } = await client.storage
        .from("branding")
        .createSignedUrl(company.logo_path, 3600); // 1 hour expiry
      
      if (!signedUrlError && signedUrlData?.signedUrl) {
        logoUrl = signedUrlData.signedUrl;
      } else {
        console.warn("Failed to get signed URL for logo_path:", signedUrlError);
      }
    } catch (e) {
      console.warn("Error getting signed URL for logo:", e);
    }
  }

  // Normalize company data
  const companyData = {
    name: company.display_name || company.name || "Your Company",
    address: company.address || "",
    phone: company.support_phone || "",
    email: company.support_email || "",
    logo: logoUrl
  };

  // Normalize customer data
  const customerName = customer.full_name || customer.name || "Customer";
  const customerAddress = customer.address || "";
  const customerPhone = customer.phone || "";
  const customerEmail = customer.email || "";

  const doc = new jsPDF("p", "pt", "letter");

  // Constants
  const margin = 40;
  const lineH = 16;
  const lightGray = [240, 240, 240];
  const mediumGray = [200, 200, 200];
  const darkGray = [100, 100, 100];
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const contentWidth = pageWidth - (margin * 2);
  const bottomMargin = 60;

  // Format dates
  const quoteDate = formatDate(quote.created_at || new Date().toISOString());
  const validUntil = quote.valid_until ? formatDate(quote.valid_until) : null;
  const status = (quote.status || 'draft').charAt(0).toUpperCase() + (quote.status || 'draft').slice(1);

  // Helper: Load image (for logo)
  async function loadImage(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
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
    } catch (e) {
      console.warn("Logo not loaded:", e);
      return null;
    }
  }

  // Helper: Draw wrapped text and return new Y position
  function drawWrappedText(doc, text, x, y, maxWidth, lineHeight) {
    if (!text || !text.trim()) return y;
    const lines = doc.splitTextToSize(text, maxWidth);
    lines.forEach((line, i) => {
      doc.text(line, x, y + (i * lineHeight));
    });
    return y + (lines.length * lineHeight);
  }

  // Outer border (subtle)
  doc.setDrawColor(...mediumGray);
  doc.setLineWidth(0.5);
  doc.rect(20, 20, pageWidth - 40, pageHeight - 40);

  // Header section
  let y = 40;
  const leftX = margin;
  const rightX = pageWidth - margin - 200; // Right column width ~200

  // Logo (if available)
  let logoHeight = 0;
  if (companyData.logo) {
    try {
      const logoData = await loadImage(companyData.logo);
      if (logoData) {
        const maxLogoWidth = 120;
        const logoAspect = logoData.w / logoData.h;
        const logoW = Math.min(maxLogoWidth, logoData.w);
        const logoH = logoW / logoAspect;
        doc.addImage(logoData.dataUrl, "PNG", leftX, y, logoW, logoH);
        logoHeight = logoH + 10; // Add spacing below logo
      }
    } catch (e) {
      // Fail silently
    }
  }

  // Company info (left side)
  let companyY = y + logoHeight;
  doc.setFontSize(16).setFont("helvetica", "bold");
  doc.text(companyData.name, leftX, companyY);
  companyY += lineH + 2;

  doc.setFont("helvetica", "normal").setFontSize(10);
  if (companyData.address) {
    const wrappedAddr = doc.splitTextToSize(companyData.address, 280);
    doc.text(wrappedAddr, leftX, companyY);
    const { h } = doc.getTextDimensions(wrappedAddr);
    companyY += h + 2;
  }
  if (companyData.phone) {
    doc.text(`Phone: ${companyData.phone}`, leftX, companyY);
    companyY += lineH;
  }
  if (companyData.email) {
    doc.text(`Email: ${companyData.email}`, leftX, companyY);
    companyY += lineH;
  }

  // Quote title and metadata (right side)
  let rightY = y;
  doc.setFontSize(24).setFont("helvetica", "bold");
  doc.text("QUOTE", rightX, rightY);
  rightY += lineH * 2;

  doc.setFontSize(10).setFont("helvetica", "normal");
  doc.setFont("helvetica", "bold");
  doc.text("Quote #:", rightX, rightY);
  doc.setFont("helvetica", "normal");
  doc.text(quote.quote_number, rightX + 70, rightY);
  rightY += lineH;

  doc.setFont("helvetica", "bold");
  doc.text("Date:", rightX, rightY);
  doc.setFont("helvetica", "normal");
  doc.text(quoteDate, rightX + 70, rightY);
  rightY += lineH;

  if (validUntil) {
    doc.setFont("helvetica", "bold");
    doc.text("Valid Until:", rightX, rightY);
    doc.setFont("helvetica", "normal");
    doc.text(validUntil, rightX + 70, rightY);
    rightY += lineH;
  }

  doc.setFont("helvetica", "bold");
  doc.text("Status:", rightX, rightY);
  doc.setFont("helvetica", "normal");
  doc.text(status, rightX + 70, rightY);

  // Divider line
  const headerBottom = Math.max(companyY, rightY) + lineH;
  y = headerBottom;
  doc.setDrawColor(...mediumGray);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += lineH * 1.2; // Reduced from 1.5

  // Bill To section
  doc.setFontSize(11).setFont("helvetica", "bold");
  doc.text("BILL TO", leftX, y);
  y += lineH;

  doc.setFont("helvetica", "normal").setFontSize(10);
  doc.text(customerName, leftX, y);
  y += lineH;
  if (customerAddress) {
    const wrappedCustAddr = doc.splitTextToSize(customerAddress, 280);
    doc.text(wrappedCustAddr, leftX, y);
    const { h } = doc.getTextDimensions(wrappedCustAddr);
    y += h + 2;
  }
  if (customerPhone) {
    doc.text(`Phone: ${customerPhone}`, leftX, y);
    y += lineH;
  }
  if (customerEmail) {
    doc.text(`Email: ${customerEmail}`, leftX, y);
    y += lineH;
  }

  // Divider before table
  y += lineH * 0.8; // Reduced from lineH
  doc.setDrawColor(...mediumGray);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += lineH * 1.2; // Reduced from 1.5

  // Services table
  const tableStartY = y;
  const tableWidth = contentWidth;
  const colWidths = {
    description: tableWidth * 0.50,
    qty: tableWidth * 0.15,
    rate: tableWidth * 0.15,
    amount: tableWidth * 0.20
  };

  // Table header with shaded background
  doc.setFillColor(...lightGray);
  doc.rect(margin, y, tableWidth, lineH * 1.8, 'F');
  doc.setDrawColor(...mediumGray);
  doc.setLineWidth(0.5);
  doc.rect(margin, y, tableWidth, lineH * 1.8);

  doc.setFont("helvetica", "bold").setFontSize(10);
  doc.text("Description", margin + 8, y + lineH * 1.2);
  doc.text("Qty", margin + colWidths.description + 8, y + lineH * 1.2, { align: 'right' });
  doc.text("Rate", margin + colWidths.description + colWidths.qty + 8, y + lineH * 1.2, { align: 'right' });
  doc.text("Amount", margin + colWidths.description + colWidths.qty + colWidths.rate + 8, y + lineH * 1.2, { align: 'right' });

  // Column dividers in header
  doc.line(margin + colWidths.description, y, margin + colWidths.description, y + lineH * 1.8);
  doc.line(margin + colWidths.description + colWidths.qty, y, margin + colWidths.description + colWidths.qty, y + lineH * 1.8);
  doc.line(margin + colWidths.description + colWidths.qty + colWidths.rate, y, margin + colWidths.description + colWidths.qty + colWidths.rate, y + lineH * 1.8);

  y += lineH * 1.8;

  // Table rows with pagination support
  const rowHeight = lineH * 1.4;
  const minYForNewPage = pageHeight - bottomMargin - 100; // Reserve space for totals

  quote.services.forEach((service, index) => {
    // Check if we need a new page
    if (y > minYForNewPage) {
      doc.addPage();
      y = margin;
      
      // Redraw table header on new page
      doc.setFillColor(...lightGray);
      doc.rect(margin, y, tableWidth, lineH * 1.8, 'F');
      doc.setDrawColor(...mediumGray);
      doc.rect(margin, y, tableWidth, lineH * 1.8);
      doc.setFont("helvetica", "bold").setFontSize(10);
      doc.text("Description", margin + 8, y + lineH * 1.2);
      doc.text("Qty", margin + colWidths.description + 8, y + lineH * 1.2, { align: 'right' });
      doc.text("Rate", margin + colWidths.description + colWidths.qty + 8, y + lineH * 1.2, { align: 'right' });
      doc.text("Amount", margin + colWidths.description + colWidths.qty + colWidths.rate + 8, y + lineH * 1.2, { align: 'right' });
      doc.line(margin + colWidths.description, y, margin + colWidths.description, y + lineH * 1.8);
      doc.line(margin + colWidths.description + colWidths.qty, y, margin + colWidths.description + colWidths.qty, y + lineH * 1.8);
      doc.line(margin + colWidths.description + colWidths.rate, y, margin + colWidths.description + colWidths.rate, y + lineH * 1.8);
      y += lineH * 1.8;
    }

    const serviceName = (service.name || '').trim() || '—';
    const qty = Math.max(0, parseFloat(service.qty) || 0);
    const rate = Math.max(0, parseFloat(service.rate) || 0);
    const lineTotal = qty * rate;

    // Row striping (alternating background)
    if (index % 2 === 1) {
      doc.setFillColor(252, 252, 252);
      doc.rect(margin, y, tableWidth, rowHeight, 'F');
    }

    // Row border
    doc.setDrawColor(...mediumGray);
    doc.setLineWidth(0.3);
    doc.rect(margin, y, tableWidth, rowHeight);

    // Column dividers
    doc.line(margin + colWidths.description, y, margin + colWidths.description, y + rowHeight);
    doc.line(margin + colWidths.description + colWidths.qty, y, margin + colWidths.description + colWidths.qty, y + rowHeight);
    doc.line(margin + colWidths.description + colWidths.qty + colWidths.rate, y, margin + colWidths.description + colWidths.qty + colWidths.rate, y + rowHeight);

    // Cell content
    doc.setFont("helvetica", "normal").setFontSize(10);
    const wrappedName = doc.splitTextToSize(serviceName, colWidths.description - 16);
    const nameHeight = doc.getTextDimensions(wrappedName).h;
    doc.text(wrappedName, margin + 8, y + (rowHeight / 2) + (nameHeight / 2) - 2);
    doc.text(qty.toString(), margin + colWidths.description + 8, y + rowHeight / 2, { align: 'right' });
    doc.text(formatMoney(rate), margin + colWidths.description + colWidths.qty + 8, y + rowHeight / 2, { align: 'right' });
    doc.text(formatMoney(lineTotal), margin + colWidths.description + colWidths.qty + colWidths.rate + 8, y + rowHeight / 2, { align: 'right' });

    y += rowHeight;
  });

  // Totals block (right aligned)
  y += lineH * 0.8; // Reduced from lineH
  const totalsX = margin + colWidths.description + colWidths.qty;
  const totalsWidth = colWidths.rate + colWidths.amount;

  // Divider above totals
  doc.setDrawColor(...mediumGray);
  doc.setLineWidth(0.5);
  doc.line(totalsX, y, margin + tableWidth, y);
  y += lineH;

  // Totals box (subtle background)
  const totalsBoxY = y;
  const totalsBoxHeight = (quote.tax > 0 ? 3 : 2) * lineH + 10;
  doc.setFillColor(250, 250, 250);
  doc.rect(totalsX, totalsBoxY, totalsWidth, totalsBoxHeight, 'F');
  doc.setDrawColor(...mediumGray);
  doc.setLineWidth(0.5);
  doc.rect(totalsX, totalsBoxY, totalsWidth, totalsBoxHeight);

  y += lineH;
  doc.setFont("helvetica", "normal").setFontSize(10);
  doc.text("Subtotal:", totalsX + 8, y, { align: 'right' });
  doc.text(formatMoney(quote.subtotal || 0), margin + tableWidth - 8, y, { align: 'right' });
  y += lineH;

  if (quote.tax > 0) {
    doc.text("Tax:", totalsX + 8, y, { align: 'right' });
    doc.text(formatMoney(quote.tax || 0), margin + tableWidth - 8, y, { align: 'right' });
    y += lineH;
  }

  // Total (bold, larger)
  doc.setFont("helvetica", "bold").setFontSize(12);
  doc.setDrawColor(...mediumGray);
  doc.setLineWidth(0.5);
  doc.line(totalsX + 8, y - 2, margin + tableWidth - 8, y - 2);
  doc.text("Total:", totalsX + 8, y, { align: 'right' });
  doc.text(formatMoney(quote.total || 0), margin + tableWidth - 8, y, { align: 'right' });

  // Calculate required footer height BEFORE deciding on page break
  const bottomY = pageHeight - bottomMargin;
  const currentYAfterTotals = y; // Y position after totals are rendered
  let requiredFooterHeight = 0;

  // Notes section height (if present)
  let notesHeight = 0;
  if (quote.notes) {
    notesHeight += lineH * 1.2; // Spacing before notes
    // Notes label + spacing
    notesHeight += lineH + 2;
    // Notes body (wrapped)
    const notesLines = doc.splitTextToSize(quote.notes, contentWidth);
    notesHeight += notesLines.length * lineH;
    notesHeight += lineH; // Spacing after notes
  }

  // Footer divider + spacing
  requiredFooterHeight += lineH * 1.2; // Divider spacing before
  requiredFooterHeight += lineH * 1.2; // Divider spacing after

  // Thank you message
  const thankYouLines = doc.splitTextToSize("Thank you for your business.", contentWidth);
  requiredFooterHeight += thankYouLines.length * lineH;
  requiredFooterHeight += lineH * 0.5; // Spacing after

  // Valid until message (if present)
  if (validUntil) {
    const validUntilLines = doc.splitTextToSize(`This quote is valid until ${validUntil}.`, contentWidth);
    requiredFooterHeight += validUntilLines.length * lineH;
    requiredFooterHeight += lineH * 0.5; // Spacing after
  }

  // Signature lines (if there's room)
  const minSpaceForSignature = 30;
  const spaceAfterFooter = bottomY - (currentYAfterTotals + notesHeight + requiredFooterHeight);
  if (spaceAfterFooter >= minSpaceForSignature) {
    requiredFooterHeight += lineH; // Space for signature line
  }

  // Check if we need a new page for notes + footer
  const totalRequiredHeight = notesHeight + requiredFooterHeight;
  
  if (currentYAfterTotals + totalRequiredHeight > bottomY) {
    // Need new page - add it now
    doc.addPage();
    y = margin;
  } else {
    // Fits on current page - continue from current Y
    y = currentYAfterTotals;
  }

  // Notes section (if present)
  if (quote.notes) {
    y += lineH * 1.2; // Reduced spacing before notes
    
    doc.setFont("helvetica", "bold").setFontSize(10);
    doc.text("Notes:", margin, y);
    y += lineH + 2; // Small spacing after label
    
    doc.setFont("helvetica", "normal").setFontSize(9);
    y = drawWrappedText(doc, quote.notes, margin, y, contentWidth, lineH);
    y += lineH; // Add spacing after notes body
  }

  // Footer section
  // Divider line above footer
  y += lineH * 1.2; // Add spacing before footer (reduced from 1.5)
  doc.setDrawColor(...mediumGray);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += lineH * 1.2; // Spacing after divider (reduced from 1.5)

  doc.setFontSize(9).setFont("helvetica", "normal").setTextColor(...darkGray);
  
  // Thank you message
  y = drawWrappedText(doc, "Thank you for your business.", margin, y, contentWidth, lineH);
  y += lineH * 0.5; // Small spacing between footer lines

  // Valid until message (if present)
  if (validUntil) {
    y = drawWrappedText(doc, `This quote is valid until ${validUntil}.`, margin, y, contentWidth, lineH);
    y += lineH * 0.5; // Small spacing after valid until
  }

  // Signature lines (only if there's enough space)
  const sigY = y + lineH;
  const remainingSpace = bottomY - sigY;
  if (remainingSpace >= minSpaceForSignature) {
    doc.setFont("helvetica", "normal").setFontSize(9);
    doc.setTextColor(0);
    doc.text("Customer Signature: ______________________", margin, sigY);
    doc.text("Date: _______________", margin + 300, sigY);
  }

  return doc;
}

/**
 * generateQuotePDF(quote, customer, company)
 * Generates a professional quote PDF with corporate clean white-label styling
 * Downloads the PDF to user's device.
 * 
 * @param {Object} quote - Quote object with: quote_number, created_at, valid_until, status, services, subtotal, tax, total, notes
 * @param {Object} customer - Customer object with: full_name, name, address, phone, email
 * @param {Object} company - Company object with: display_name, name, address, support_phone, support_email, logo_path
 */
export async function generateQuotePDF(quote = {}, customer = {}, company = {}) {
  const doc = await buildQuotePdfDoc(quote, customer, company);
  const filename = `Quote-${quote.quote_number}.pdf`;
  doc.save(filename);
}
