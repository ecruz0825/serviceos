// @ts-nocheck
// supabase/functions/auto-generate-recurring-jobs/index.ts
// Invokes canonical DB logic via generate_jobs_from_recurring_for_company(p_company_id)
// for each company with auto_generate_recurring_jobs = true.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

type CompanyFlag = {
  id: string;
  auto_generate_recurring_jobs: boolean;
};

type RpcRow = {
  recurring_job_id: string;
  job_id: string | null;
  service_date: string;
  created: boolean;
};

serve(async (req: Request) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ ok: false, error: "Use POST" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!url || !key) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing Supabase env vars" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(url, key, {
      auth: { persistSession: false },
    });

    // 1) Companies that have auto_generate_recurring_jobs = true
    const { data: companyFlags, error: companyErr } = await supabase
      .from<CompanyFlag>("companies")
      .select("id, auto_generate_recurring_jobs")
      .eq("auto_generate_recurring_jobs", true);

    if (companyErr) {
      console.error("Error loading company flags:", companyErr);
      return new Response(
        JSON.stringify({ ok: false, error: companyErr.message }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const companies = companyFlags || [];
    if (companies.length === 0) {
      return new Response(
        JSON.stringify({
          ok: true,
          createdJobs: 0,
          companiesProcessed: 0,
          message: "No companies with auto_generate_recurring_jobs = true",
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    let totalCreated = 0;
    const perCompany: { company_id: string; created: number; error?: string }[] = [];

    // 2) For each company, call the canonical company-scoped RPC (same logic as Scheduling Center)
    for (const company of companies) {
      const { data: rows, error: rpcErr } = await supabase.rpc<RpcRow>(
        "generate_jobs_from_recurring_for_company",
        { p_company_id: company.id }
      );

      if (rpcErr) {
        console.error(`RPC error for company ${company.id}:`, rpcErr);
        perCompany.push({ company_id: company.id, created: 0, error: rpcErr.message });
        continue;
      }

      const created = (rows || []).filter((r) => r.created).length;
      totalCreated += created;
      perCompany.push({ company_id: company.id, created });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        createdJobs: totalCreated,
        companiesProcessed: companies.length,
        perCompany,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Unexpected error in auto-generate-recurring-jobs:", err);
    return new Response(
      JSON.stringify({ ok: false, error: "Unexpected error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
