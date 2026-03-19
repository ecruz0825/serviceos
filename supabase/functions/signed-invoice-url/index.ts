// supabase/functions/signed-invoice-url/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  // Handle preflight (CORS)
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Only allow POST
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed. Use POST." }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  try {
    // Parse request body
    const body = await req.json();
    const { path, expiresIn } = body;

    // Validate path
    if (!path || typeof path !== "string" || path.trim() === "") {
      return new Response(
        JSON.stringify({ error: "path is required and must be a non-empty string" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Step 1: Extract JWT from Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid Authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const jwt = authHeader.replace("Bearer ", "");

    // Step 2: Validate JWT with anon client
    const projectUrl = Deno.env.get("PROJECT_URL") || Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("ANON_KEY") || Deno.env.get("SUPABASE_ANON_KEY");

    if (!projectUrl || !anonKey) {
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const anonClient = createClient(projectUrl, anonKey);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(jwt);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Step 3: Get profile with service role client
    const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const serviceClient = createClient(projectUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: profile, error: profileError } = await serviceClient
      .from("profiles")
      .select("role, company_id")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: "Profile not found" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!profile.company_id) {
      return new Response(
        JSON.stringify({ error: "User is not associated with a company" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Step 4: Validate invoice path belongs to company
    // Expected path format: `${companyId}/${jobId}/...pdf`
    const pathParts = path.split("/").filter((p) => p.length > 0);
    if (pathParts.length < 2) {
      return new Response(
        JSON.stringify({ error: "Invalid path format. Expected: companyId/jobId/...pdf" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const companyIdFromPath = pathParts[0];
    const jobIdFromPath = pathParts[1];

    if (companyIdFromPath !== profile.company_id) {
      return new Response(
        JSON.stringify({ error: "Path does not belong to your company" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Step 5: Authorization based on role
    const userRole = profile.role;

    if (userRole === "admin") {
      // Admin: allow
    } else if (userRole === "crew") {
      // Crew: allow only if user is on the job's assigned team
      const { data: crewMember, error: crewError } = await serviceClient
        .from("crew_members")
        .select("id")
        .eq("user_id", user.id)
        .eq("company_id", profile.company_id)
        .limit(1)
        .single();

      if (crewError || !crewMember) {
        return new Response(
          JSON.stringify({ error: "Crew member record not found" }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const { data: job, error: jobError } = await serviceClient
        .from("jobs")
        .select("assigned_team_id")
        .eq("id", jobIdFromPath)
        .eq("company_id", profile.company_id)
        .single();

      if (jobError || !job) {
        return new Response(
          JSON.stringify({ error: "Job not found" }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Check if job has assigned team
      if (!job.assigned_team_id) {
        return new Response(
          JSON.stringify({ error: "Job is not assigned to a team" }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Check if crew member is on the job's assigned team
      const { data: teamMember, error: teamMemberError } = await serviceClient
        .from("team_members")
        .select("team_id")
        .eq("team_id", job.assigned_team_id)
        .eq("crew_member_id", crewMember.id)
        .limit(1)
        .single();

      if (teamMemberError || !teamMember) {
        return new Response(
          JSON.stringify({ error: "You are not assigned to this job" }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    } else if (userRole === "customer") {
      // Customer: allow only if job.customer_id matches caller's customer record
      const { data: customer, error: customerError } = await serviceClient
        .from("customers")
        .select("id")
        .eq("user_id", user.id)
        .eq("company_id", profile.company_id)
        .limit(1)
        .single();

      if (customerError) {
        return new Response(
          JSON.stringify({
            error: `Customer lookup failed: ${customerError.message || "Unknown error"}`,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      if (!customer) {
        return new Response(
          JSON.stringify({ error: "Customer record not found" }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const { data: job, error: jobError } = await serviceClient
        .from("jobs")
        .select("customer_id")
        .eq("id", jobIdFromPath)
        .eq("company_id", profile.company_id)
        .single();

      if (jobError || !job) {
        return new Response(
          JSON.stringify({ error: "Job not found" }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      if (job.customer_id !== customer.id) {
        return new Response(
          JSON.stringify({ error: "This job does not belong to you" }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    } else {
      // Unknown role
      return new Response(
        JSON.stringify({ error: "Unauthorized role" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Step 6: Generate signed URL
    const bucket = "invoices";
    const defaultExpiresIn = 604800; // 7 days in seconds
    const expiresInSeconds = expiresIn || defaultExpiresIn;

    const { data: signedUrlData, error: signedUrlError } = await serviceClient
      .storage
      .from(bucket)
      .createSignedUrl(path, expiresInSeconds);

    if (signedUrlError || !signedUrlData) {
      return new Response(
        JSON.stringify({ error: `Failed to generate signed URL: ${signedUrlError?.message || "Unknown error"}` }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Step 7: Return signed URL
    return new Response(
      JSON.stringify({ url: signedUrlData.signedUrl }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Error in signed-invoice-url:", err);
    // Return generic error message without exposing stack traces
    const errorMessage = err instanceof Error ? err.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

