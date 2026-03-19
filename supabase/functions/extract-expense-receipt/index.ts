// supabase/functions/extract-expense-receipt/index.ts
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
      JSON.stringify({ ok: false, error: "method_not_allowed", message: "Method not allowed. Use POST." }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  try {
    // Parse request body
    const body = await req.json();
    const { expense_id } = body;

    // Validate expense_id
    if (!expense_id || typeof expense_id !== "string" || expense_id.trim() === "") {
      return new Response(
        JSON.stringify({ ok: false, error: "invalid_input", message: "expense_id is required and must be a non-empty string" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Step 1: Extract JWT from Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ ok: false, error: "unauthorized", message: "Missing or invalid Authorization header" }),
        {
          status: 200,
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
        JSON.stringify({ ok: false, error: "server_error", message: "Server configuration error" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const anonClient = createClient(projectUrl, anonKey);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(jwt);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ ok: false, error: "unauthorized", message: "Invalid or expired token" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Step 3: Get profile with service role client
    const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceRoleKey) {
      return new Response(
        JSON.stringify({ ok: false, error: "server_error", message: "Server configuration error" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const serviceClient = createClient(projectUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // Step 4: Get caller's company_id from profile
    const { data: profile, error: profileError } = await serviceClient
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ ok: false, error: "profile_not_found", message: "Profile not found" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!profile.company_id) {
      return new Response(
        JSON.stringify({ ok: false, error: "no_company", message: "User is not associated with a company" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const callerCompanyId = profile.company_id;

    // Step 5: Fetch expense and verify tenant safety
    const { data: expense, error: expenseError } = await serviceClient
      .from("expenses")
      .select("id, company_id, receipt_path, receipt_paths")
      .eq("id", expense_id)
      .single();

    if (expenseError || !expense) {
      return new Response(
        JSON.stringify({ ok: false, error: "expense_not_found", message: "Expense not found" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Verify company_id matches
    if (expense.company_id !== callerCompanyId) {
      return new Response(
        JSON.stringify({ ok: false, error: "forbidden", message: "Expense does not belong to your company" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Step 6: Determine which receipt paths to use
    // Prefer receipt_paths array if it exists and has items, otherwise fallback to receipt_path
    let receiptPaths: string[] = [];
    if (expense.receipt_paths && Array.isArray(expense.receipt_paths) && expense.receipt_paths.length > 0) {
      receiptPaths = expense.receipt_paths.filter((path: any) => path && typeof path === 'string');
    } else if (expense.receipt_path && typeof expense.receipt_path === 'string') {
      receiptPaths = [expense.receipt_path];
    }

    // Verify at least one receipt path exists
    if (receiptPaths.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: "no_receipt", message: "Expense does not have a receipt" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Step 7: Helper function to infer MIME type from path
    const inferMimeType = (path: string): string | null => {
      const pathLower = path.toLowerCase();
      const pathWithoutQuery = pathLower.split('?')[0];
      
      if (pathWithoutQuery.endsWith('.jpeg') || pathWithoutQuery.endsWith('.jpg')) {
        return "image/jpeg";
      } else if (pathWithoutQuery.endsWith('.png')) {
        return "image/png";
      } else if (pathWithoutQuery.endsWith('.webp')) {
        return "image/webp";
      } else if (pathWithoutQuery.endsWith('.gif')) {
        return "image/gif";
      } else if (pathWithoutQuery.endsWith('.pdf')) {
        return null; // PDF not supported
      }
      return null;
    };

    // Step 8: Helper function to fetch and convert image to base64
    interface ImageData {
      base64: string;
      mime: string;
      path: string;
    }

    const fetchImageAsBase64 = async (receiptPath: string): Promise<ImageData | null> => {
      try {
        // Generate signed URL for this receipt path
        const { data: signedUrlData, error: signedUrlError } = await serviceClient.storage
          .from("expense-receipts")
          .createSignedUrl(receiptPath, 60);

        if (signedUrlError || !signedUrlData) {
          console.error(`Failed to generate signed URL for ${receiptPath}:`, signedUrlError?.message);
          return null;
        }

        const receiptUrl = signedUrlData.signedUrl;
        const inferredMime = inferMimeType(receiptPath);

        // Reject PDFs early
        if (inferredMime === null) {
          console.error(`Unsupported file type for ${receiptPath}`);
          return null;
        }

        // Fetch the image
        const receiptResponse = await globalThis.fetch(receiptUrl, { method: "GET" });
        if (!receiptResponse.ok) {
          console.error(`Failed to fetch receipt ${receiptPath}: ${receiptResponse.statusText}`);
          return null;
        }

        // Get content-type from headers
        const headerType = receiptResponse.headers.get("content-type") || "";
        
        // Determine final MIME type
        let finalMime: string;
        if (headerType.startsWith("image/")) {
          finalMime = headerType;
        } else {
          finalMime = inferredMime;
        }
        
        // Ensure finalMime is always image/*
        if (!finalMime.startsWith("image/")) {
          finalMime = inferredMime;
        }

        // Convert to base64
        const arrayBuffer = await receiptResponse.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);

        let binary = "";
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }

        const imageBase64 = btoa(binary);

        return {
          base64: imageBase64,
          mime: finalMime,
          path: receiptPath,
        };
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`Error fetching image ${receiptPath}:`, errMsg);
        return null;
      }
    };

    // Step 9: Fetch all receipt images
    const imageDataPromises = receiptPaths.map(path => fetchImageAsBase64(path));
    const imageDataResults = await Promise.all(imageDataPromises);
    const imageDataArray = imageDataResults.filter((data): data is ImageData => data !== null);

    // If all pages failed, return error
    if (imageDataArray.length === 0) {
      return new Response(
        JSON.stringify({ 
          ok: false, 
          error: "receipt_fetch_failed", 
          message: "Failed to fetch all receipt pages" 
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Log how many pages we're processing
    console.log(`Processing ${imageDataArray.length} receipt page(s) for expense ${expense_id}`);

    // Step 8: Call OpenAI Vision API
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ 
          ok: false, 
          error: "server_error", 
          message: "OPENAI_API_KEY not configured" 
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Use gpt-4o or gpt-4-turbo for vision (gpt-4o is newer and better)
    const model = "gpt-4o";

    const prompt = `You are parsing a receipt. You may receive multiple receipt pages in order (page 1, page 2, page 3, etc.). Treat all pages as one unified receipt. Extract vendor, date, amount, line_items, and confidence across all pages. Return ONLY valid JSON with no markdown, no code blocks, no explanation. Use this exact structure:

{
  "vendor": string or null,
  "vendor_domain": string or null,
  "date": "YYYY-MM-DD" or null,
  "amount": number or null,
  "category": string or null,
  "note": string or null,
  "line_items": [
    {
      "description": string,
      "quantity": number or null,
      "unit_price": number or null,
      "line_total": number or null,
      "category": string or null,
      "confidence": number (0-1) or null
    }
  ],
  "confidence": {
    "overall": number (0-1) or null,
    "vendor": number (0-1) or null,
    "date": number (0-1) or null,
    "amount": number (0-1) or null,
    "category": number (0-1) or null
  }
}

Extraction Rules:
- vendor: Extract the printed vendor/business name (first preference: official printed name on receipt header)
- vendor_domain: ONLY infer if you are confident (e.g., if receipt shows "walmart.com" or clear domain reference, set to "walmart.com"). Otherwise null.
- date: YYYY-MM-DD format only, or null if not found
- amount: Total amount as numeric value (no currency symbols, no commas). This is the grand total.
- category: Short category name (e.g., "Office Supplies", "Travel", "Meals"), or null
- note: Brief description or additional notes, or null

Line Items:
- Extract each line item from the receipt
- description: REQUIRED - item/service name
- quantity: Numeric value if available, null otherwise
- unit_price: Numeric value if available, null otherwise
- line_total: Numeric value if available, null otherwise
- category: Optional category for this line item, or null
- confidence: Your confidence (0-1) for this line item extraction, or null

Confidence Scores:
- overall: Your overall confidence (0-1) in the entire extraction, considering all fields
- vendor: Confidence (0-1) in vendor extraction, or null
- date: Confidence (0-1) in date extraction, or null
- amount: Confidence (0-1) in amount extraction, or null
- category: Confidence (0-1) in category extraction, or null

Important:
- All numeric values must be numbers (not strings)
- All confidence scores must be between 0 and 1
- line_items must always be an array (empty array [] if no line items found)
- If a field cannot be determined, use null (not empty string, not 0)
- Return ONLY the JSON object, nothing else`;

    try {
      const openaiResponse = await globalThis.fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openaiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: model,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: prompt,
                },
                // Add all images in order
                ...imageDataArray.map(img => ({
                  type: "image_url" as const,
                  image_url: {
                    url: `data:${img.mime};base64,${img.base64}`,
                  },
                })),
              ],
            },
          ],
          max_tokens: 2000, // Increased for line items
          response_format: { type: "json_object" },
        }),
      });

      if (!openaiResponse.ok) {
        let errorData;
        try {
          errorData = await openaiResponse.json();
        } catch {
          errorData = await openaiResponse.text();
        }
        console.error("OpenAI API error:", errorData);
        
        // Handle 429 (rate limit) or insufficient_quota
        if (openaiResponse.status === 429 || errorData?.error?.code === 'insufficient_quota') {
          return new Response(
            JSON.stringify({ 
              ok: false, 
              error: 'insufficient_quota', 
              message: 'AI extraction unavailable: OpenAI quota/credits exhausted. Add credits or raise limits.' 
            }),
            {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
        
        // Handle other OpenAI errors
        const errorMessage = errorData?.error?.message || errorData?.message || `OpenAI API error: ${openaiResponse.statusText}`;
        return new Response(
          JSON.stringify({ 
            ok: false, 
            error: "openai_error", 
            message: errorMessage 
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const openaiData = await openaiResponse.json();
      const content = openaiData.choices?.[0]?.message?.content;

      if (!content) {
        console.error("No content in OpenAI response");
        return new Response(
          JSON.stringify({ 
            ok: false, 
            error: "extraction_failed", 
            message: "AI extraction failed: OpenAI returned empty response" 
          }),
          {
            status: 422,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Parse JSON response
      let rawExtraction;
      try {
        // Remove any markdown code blocks if present
        const cleanedContent = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        rawExtraction = JSON.parse(cleanedContent);
      } catch (parseError) {
        console.error("Failed to parse OpenAI response:", content);
        return new Response(
          JSON.stringify({ 
            ok: false, 
            error: "extraction_failed", 
            message: "AI extraction failed: The model returned invalid JSON." 
          }),
          {
            status: 422,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Helper function to clamp confidence score to [0, 1]
      const clampConfidence = (score: any): number | null => {
        if (score === null || score === undefined) return null;
        const num = typeof score === 'number' ? score : parseFloat(score);
        if (isNaN(num)) return null;
        return Math.max(0, Math.min(1, num));
      };

      // Helper function to normalize numeric value
      const normalizeNumber = (value: any): number | null => {
        if (value === null || value === undefined) return null;
        const num = typeof value === 'number' ? value : parseFloat(value);
        return isNaN(num) ? null : num;
      };

      // Helper function to normalize string
      const normalizeString = (value: any): string | null => {
        if (value === null || value === undefined) return null;
        if (typeof value !== 'string') return null;
        const trimmed = value.trim();
        return trimmed === '' ? null : trimmed;
      };

      // Helper function to pick first non-null from array or value
      const pickFirstNonNull = <T>(value: T | T[] | null | undefined): T | null => {
        if (value === null || value === undefined) return null;
        if (Array.isArray(value)) {
          const nonNull = value.find(v => v !== null && v !== undefined);
          return nonNull !== undefined ? nonNull : null;
        }
        return value;
      };

      // Safety merging: Handle cases where GPT might return arrays (shouldn't happen, but safety first)
      const mergedVendor = pickFirstNonNull(rawExtraction.vendor);
      const mergedVendorDomain = pickFirstNonNull(rawExtraction.vendor_domain);
      const mergedDate = pickFirstNonNull(rawExtraction.date);
      const mergedCategory = pickFirstNonNull(rawExtraction.category);
      const mergedNote = pickFirstNonNull(rawExtraction.note);

      // For amount: if array, pick the one with highest confidence or largest value
      let mergedAmount: number | null = null;
      if (Array.isArray(rawExtraction.amount)) {
        // If we have confidence scores, prefer highest confidence
        const amounts = rawExtraction.amount.filter((a: any) => a !== null && a !== undefined);
        if (amounts.length > 0) {
          mergedAmount = Math.max(...amounts.map((a: any) => normalizeNumber(a) || 0));
        }
      } else {
        mergedAmount = normalizeNumber(rawExtraction.amount);
      }

      // Normalize line items (GPT should merge them, but ensure we have all)
      let lineItems: any[] = [];
      if (Array.isArray(rawExtraction.line_items)) {
        lineItems = rawExtraction.line_items.map((item: any) => ({
          description: normalizeString(item.description) || '',
          quantity: normalizeNumber(item.quantity),
          unit_price: normalizeNumber(item.unit_price),
          line_total: normalizeNumber(item.line_total),
          category: normalizeString(item.category),
          confidence: clampConfidence(item.confidence),
        }));
      }

      // Normalize confidence object (average if array, otherwise use value)
      const normalizeConfidenceField = (value: any): number | null => {
        if (value === null || value === undefined) return null;
        if (Array.isArray(value)) {
          const scores = value.map(v => clampConfidence(v)).filter((v): v is number => v !== null);
          if (scores.length === 0) return null;
          // Average the confidence scores
          const avg = scores.reduce((sum, s) => sum + s, 0) / scores.length;
          return clampConfidence(avg);
        }
        return clampConfidence(value);
      };

      const confidence = {
        overall: normalizeConfidenceField(rawExtraction.confidence?.overall),
        vendor: normalizeConfidenceField(rawExtraction.confidence?.vendor),
        date: normalizeConfidenceField(rawExtraction.confidence?.date),
        amount: normalizeConfidenceField(rawExtraction.confidence?.amount),
        category: normalizeConfidenceField(rawExtraction.confidence?.category),
      };

      // Normalize header fields with merged values
      const normalizedSuggestion = {
        vendor: normalizeString(mergedVendor),
        vendor_domain: normalizeString(mergedVendorDomain),
        date: (() => {
          const dateStr = normalizeString(mergedDate);
          if (!dateStr) return null;
          // Validate date format YYYY-MM-DD
          const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
          return dateRegex.test(dateStr) ? dateStr : null;
        })(),
        amount: mergedAmount,
        category: normalizeString(mergedCategory),
        note: normalizeString(mergedNote),
        line_items: lineItems,
        confidence: confidence,
      };

      // Build response with backward compatibility
      // The suggestion object contains all fields (new and old format compatible)
      return new Response(
        JSON.stringify({ 
          ok: true, 
          suggestion: normalizedSuggestion
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    } catch (openaiError) {
      console.error("OpenAI API call failed:", openaiError);
      
      // Handle network/other errors
      return new Response(
        JSON.stringify({ 
          ok: false, 
          error: "openai_error", 
          message: `AI extraction failed: ${openaiError.message || 'Unknown error'}` 
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("Error in extract-expense-receipt:", errMsg);
    return new Response(
      JSON.stringify({ ok: false, error: "server_error", message: "Server error: " + errMsg }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

