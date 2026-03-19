// src/utils/gcal.js
export function openGCalForJob({ job, customer, companyName }) {
  // Default to 9:00 AM local on the job's service_date (or today if missing)
  const startLocal = job.service_date ? new Date(job.service_date) : new Date();
  startLocal.setHours(9, 0, 0, 0);
  const endLocal = new Date(startLocal.getTime() + 60 * 60 * 1000); // +1 hour

  const toGCalUTC = (d) => {
    const pad = (n) => String(n).padStart(2, "0");
    return (
      d.getUTCFullYear().toString() +
      pad(d.getUTCMonth() + 1) +
      pad(d.getUTCDate()) +
      "T" +
      pad(d.getUTCHours()) +
      pad(d.getUTCMinutes()) +
      "00Z"
    );
  };

  const startUTC = toGCalUTC(startLocal);
  const endUTC = toGCalUTC(endLocal);

  const title = `${companyName || "ServiceOps"} – ${job.services_performed || "Service"}`;
  const detailsLines = [
    companyName ? `${companyName}` : null,
    customer?.full_name ? `Customer: ${customer.full_name}` : null,
    `Service: ${job.services_performed || "Service"}`,
    `Price: $${job.job_cost ?? 0}`,
  ].filter(Boolean);
  const details = detailsLines.join("\n");

  const location = customer?.address || "";

  const url =
    "https://calendar.google.com/calendar/render" +
    `?action=TEMPLATE` +
    `&text=${encodeURIComponent(title)}` +
    `&dates=${startUTC}/${endUTC}` +
    `&details=${encodeURIComponent(details)}` +
    `&location=${encodeURIComponent(location)}` +
    `&sf=true&output=xml`;

  window.open(url, "_blank");
}
