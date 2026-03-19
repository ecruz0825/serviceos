// src/utils/ics.js

function pad(n) { return String(n).padStart(2, "0"); }

function toIcsUtc(dt) {
  // ICS UTC format: YYYYMMDDTHHMMSSZ
  return (
    dt.getUTCFullYear().toString() +
    pad(dt.getUTCMonth() + 1) +
    pad(dt.getUTCDate()) +
    "T" +
    pad(dt.getUTCHours()) +
    pad(dt.getUTCMinutes()) +
    pad(dt.getUTCSeconds()) +
    "Z"
  );
}

function esc(str = "") {
  // Escape per RFC5545: commas, semicolons, and newlines
  return String(str)
    .replace(/\\/g, "\\\\")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/\r?\n/g, "\\n");
}

export function downloadIcsForJob({ job, customer, companyName, timezone, location }) {
  const title = `${companyName || "ServiceOps"} – ${job?.services_performed || "Service"}`;

  // Default to 9:00 AM local if no time set; duration = 1 hour
  const startLocal = job?.service_date ? new Date(job.service_date) : new Date();
  startLocal.setHours(9, 0, 0, 0);
  const endLocal = new Date(startLocal.getTime() + 60 * 60 * 1000);

  // Convert to UTC for best cross-calendar compatibility
  const dtstamp = toIcsUtc(new Date());
  const dtstart = toIcsUtc(startLocal);
  const dtend   = toIcsUtc(endLocal);

  const lines = [
    companyName ? `${companyName}` : null,
    customer?.full_name ? `Customer: ${customer.full_name}` : null,
    job?.services_performed ? `Service: ${job.services_performed}` : null,
    (job?.job_cost ?? null) !== null ? `Price: $${job.job_cost}` : null,
    timezone ? `Timezone: ${timezone}` : null,
  ].filter(Boolean);

  const desc = esc(lines.join("\n"));
  const loc  = esc(location || customer?.address || "");

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Service Scheduler//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${esc(String(job?.id || Date.now()))}@service-scheduler`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${dtstart}`,
    `DTEND:${dtend}`,
    `SUMMARY:${esc(title)}`,
    `DESCRIPTION:${desc}`,
    `LOCATION:${loc}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `job-${job?.id || "event"}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}