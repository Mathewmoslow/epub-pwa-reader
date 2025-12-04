import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

function buildCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigins = [
    "https://epub-pwa-reader.vercel.app",
    "http://localhost:5173",
    "http://localhost:3000",
  ];
  const allowOrigin = origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
}

function jsonResponse(body: Record<string, unknown>, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get("origin");
  const corsHeaders = buildCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      console.error("Missing env: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
      return jsonResponse({ active: false, error: "server config error" }, 500, corsHeaders);
    }

    const url = new URL(req.url);
    const bookId = url.searchParams.get("bookId");
    if (!bookId) {
      return jsonResponse({ active: false, error: "missing bookId param" }, 400, corsHeaders);
    }

    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
    const token = authHeader?.replace(/Bearer /i, "");
    if (!token) {
      console.error("Missing auth header");
      return jsonResponse({ active: false, error: "missing auth header" }, 401, corsHeaders);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: userResp, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userResp?.user) {
      console.error("User verification failed:", userError?.message);
      return jsonResponse({ active: false, error: "invalid user", detail: userError?.message }, 401, corsHeaders);
    }

    const uid = userResp.user.id;
    console.log(`Checking entitlement for user ${uid}, book ${bookId}`);

    const { data, error } = await supabase
      .from("entitlements")
      .select("active")
      .eq("user_id", uid)
      .eq("book_id", bookId)
      .maybeSingle();

    if (error) {
      console.error("DB query error:", error.message);
      return jsonResponse({ active: false, error: "db error", detail: error.message }, 500, corsHeaders);
    }

    const active = data?.active === true;
    console.log(`Entitlement result: active=${active}`);

    return jsonResponse({ active, checkedAt: new Date().toISOString() }, 200, corsHeaders);
  } catch (err) {
    console.error("Exception in entitlement-status:", err);
    return jsonResponse({ active: false, error: "exception", detail: String(err) }, 500, corsHeaders);
  }
});
