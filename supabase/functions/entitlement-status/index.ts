import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("PROJECT_URL");
const supabaseKey = Deno.env.get("SERVICE_ROLE_KEY");

function buildCorsHeaders(origin: string | null) {
  const allowOrigin = origin || "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
}

function jsonResponse(body: Record<string, unknown>, status = 200, origin: string | null = null) {
  const corsHeaders = buildCorsHeaders(origin);
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

export default async function handler(req: Request) {
  try {
    const origin = req.headers.get("origin");
    const corsHeaders = buildCorsHeaders(origin);

    if (req.method === "OPTIONS") {
      return new Response("ok", { status: 200, headers: corsHeaders });
    }

    if (!supabaseUrl || !supabaseKey) {
      return jsonResponse({ active: false, error: "missing env" }, 500, origin);
    }

    if (req.method !== "GET") {
      return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
    }

    const bookId = new URL(req.url).searchParams.get("bookId");
    if (!bookId) {
      return jsonResponse({ active: false, error: "missing bookId" }, 400, origin);
    }

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace(/bearer /i, "").trim();
    if (!token) {
      return jsonResponse({ active: false, error: "missing token" }, 401, origin);
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userResp, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userResp?.user) {
      return jsonResponse({ active: false, error: "invalid user", detail: userError?.message }, 401, origin);
    }

    const uid = userResp.user.id;
    const { data, error } = await supabase
      .from("entitlements")
      .select("active")
      .eq("user_id", uid)
      .eq("book_id", bookId)
      .maybeSingle();

    if (error) {
      return jsonResponse({ active: false, error: "db error", detail: error.message }, 500, origin);
    }

    const active = data?.active === true;
    return jsonResponse({ active, checkedAt: new Date().toISOString() }, 200, origin);
  } catch (err) {
    return jsonResponse({ active: false, error: "exception", detail: `${err}` }, 500, req.headers.get("origin"));
  }
}
