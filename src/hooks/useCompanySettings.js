// src/hooks/useCompanySettings.js
import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { useUser } from "../context/UserContext";

export default function useCompanySettings() {
  const { effectiveCompanyId } = useUser();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  useEffect(() => {
    (async () => {
      try {
        // Use effectiveCompanyId from UserContext (supports support mode)
        if (!effectiveCompanyId) { setLoading(false); return; }

        // settings from companies table
        const { data: company, error: cErr } = await supabase
  .from("companies")
  .select(`
    id,
    name,
    display_name,
    support_email,
    support_phone,
    address,
    logo_path,
    email_footer,
    timezone,
    crew_label,
    customer_label,
    primary_color,
    auto_generate_recurring_jobs
  `)
  .eq("id", effectiveCompanyId)
  .single();
        if (cErr) throw cErr;

        // normalize (fallbacks)
        const normalized = {
  company_id: company.id,
  display_name: company.display_name || company.name || "",
  support_email: company.support_email || "",
  support_phone: company.support_phone || "",
  address: company.address || "",
  logo_path: company.logo_path || null,
  email_footer: company.email_footer || "",
  timezone: company.timezone || "UTC",
  crew_label: company.crew_label || "Crew",
  customer_label: company.customer_label || "Customer",
  primary_color: company.primary_color || "#22c55e",
  auto_generate_recurring_jobs:
    typeof company.auto_generate_recurring_jobs === "boolean"
      ? company.auto_generate_recurring_jobs
      : false, // safe default
};

        setSettings(normalized);
      } catch (e) {
        setError(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return { settings, loading, error };
}