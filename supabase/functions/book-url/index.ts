import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("PROJECT_URL");
const supabaseKey = Deno.env.get("SERVICE_ROLE_KEY");
const bucket = Deno.env.get("BOOKS_BUCKET") || "books";
const signedSeconds = Number(Deno.env.get("SIGNED_EXP_SECONDS") || 600);

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
    const corsHeaders = buildCorsHeaders(req.headers.get("origin"));
    if (req.method === "OPTIONS") {
      return new Response("ok", { status: 200, headers: corsHeaders });
    }

    if (!supabaseUrl || !supabaseKey) {
      return jsonResponse({ error: "missing env" }, 500, req.headers.get("origin"));
    }

    if (req.method !== "GET") {
      return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
    }

    const bookId = new URL(req.url).searchParams.get("bookId");
    if (!bookId) {
      return jsonResponse({ error: "missing bookId" }, 400, req.headers.get("origin"));
    }

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace(/bearer /i, "").trim();
    if (!token) {
      return jsonResponse({ error: "missing token" }, 401, req.headers.get("origin"));
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userResp, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userResp?.user) {
      return jsonResponse({ error: "invalid user", detail: userError?.message }, 401, req.headers.get("origin"));
    }

    const uid = userResp.user.id;
    const { data: ent, error: entErr } = await supabase
      .from("entitlements")
      .select("active")
      .eq("user_id", uid)
      .eq("book_id", bookId)
      .maybeSingle();

    if (entErr) return jsonResponse({ error: "db error", detail: entErr.message }, 500, req.headers.get("origin"));
    if (!ent?.active) return jsonResponse({ error: "revoked" }, 403, req.headers.get("origin"));

    const { data: book, error: bookErr } = await supabase
      .from("books")
      .select("storage_path")
      .eq("id", bookId)
      .maybeSingle();

    if (bookErr) return jsonResponse({ error: "db error", detail: bookErr.message }, 500, req.headers.get("origin"));
    if (!book?.storage_path) {
      return jsonResponse({ error: "book missing" }, 404, req.headers.get("origin"));
    }

    const { data: signed, error: signErr } = await supabase.storage
      .from(bucket)
      .createSignedUrl(book.storage_path, signedSeconds);

    if (signErr || !signed?.signedUrl) {
      return jsonResponse({ error: "sign failed", detail: signErr?.message }, 500, req.headers.get("origin"));
    }

    return jsonResponse({ url: signed.signedUrl, expiresIn: signedSeconds }, 200, req.headers.get("origin"));
  } catch (err) {
    return jsonResponse({ error: "exception", detail: `${err}` }, 500, req.headers.get("origin"));
  }
}
