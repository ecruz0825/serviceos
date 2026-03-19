import jsPDF from "jspdf";

export function generateCustomerJobHistoryPDF(customer, jobs) {
  const doc = new jsPDF("p", "pt", "letter");
  const margin = 40;
  const lineHeight = 18;
  let y = margin;

  // Header
  doc.setFont("helvetica", "bold").setFontSize(18);
  doc.text("Customer Job History", margin, y);
  y += lineHeight * 2;

  // Customer Info
  doc.setFontSize(12).setFont("helvetica", "bold");
  doc.text("Name:", margin, y);
  doc.setFont("helvetica", "normal");
  doc.text(customer.full_name || "N/A", margin + 60, y);
  y += lineHeight;

  doc.setFont("helvetica", "bold");
  doc.text("Email:", margin, y);
  doc.setFont("helvetica", "normal");
  doc.text(customer.email || "N/A", margin + 60, y);
  y += lineHeight;

  doc.setFont("helvetica", "bold");
  doc.text("Phone:", margin, y);
  doc.setFont("helvetica", "normal");
  doc.text(customer.phone || "N/A", margin + 60, y);
  y += lineHeight;

  doc.setFont("helvetica", "bold");
  doc.text("Address:", margin, y);
  doc.setFont("helvetica", "normal");
  doc.text(customer.address || "N/A", margin + 60, y);
  y += lineHeight * 2;
 // Tags
if (Array.isArray(customer.tags) && customer.tags.length > 0) {
  doc.setFont("helvetica", "bold");
  doc.text("Tags:", margin, y);
  doc.setFont("helvetica", "normal");
  doc.text(customer.tags.join(", "), margin + 60, y);
  y += lineHeight;
}

// Notes
if (customer.notes) {
  doc.setFont("helvetica", "bold");
  doc.text("Notes:", margin, y);
  doc.setFont("helvetica", "normal");

  // Split long notes into lines
  const notesLines = doc.splitTextToSize(customer.notes, 500);
  doc.text(notesLines, margin + 60, y);
  y += lineHeight * notesLines.length;
}

y += lineHeight;

  // Jobs Header
  doc.setFont("helvetica", "bold").setFontSize(14);
  doc.text("Job History", margin, y);
  y += lineHeight;

  let total = 0;

  doc.setFont("helvetica", "normal").setFontSize(12);
  jobs.forEach((job, index) => {
    const date = job.service_date?.split("T")[0] || "Unknown";
    const cost = job.job_cost || 0;
    total += cost;

    const jobLine = `${index + 1}. ${date} — $${cost.toFixed(2)}`;
    if (y > 750) {
      doc.addPage();
      y = margin;
    }
    doc.text(jobLine, margin, y);
    y += lineHeight;
  });

  y += lineHeight;
  doc.setFont("helvetica", "bold");
  doc.text(`Total Billed: $${total.toFixed(2)}`, margin, y);

  doc.save(`${customer.full_name}_Job_History.pdf`);
}