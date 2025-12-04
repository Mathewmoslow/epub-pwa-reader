import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const SIGNED_URL_EXPIRY_SECONDS = 3600; // 1 hour

// Build CORS headers - MUST be available even if request handling throws
function buildCorsHeaders(origin: string | null): Record<string, string> {
  // Check if origin is allowed
  const isAllowed = origin && (
    origin.endsWith(".vercel.app") || // All Vercel preview deployments
    origin === "https://epub.mathewmoslow.com" ||
    origin === "http://localhost:5173" ||
    origin === "http://localhost:3000"
  );
  const allowOrigin = isAllowed ? origin : "https://epub-pwa-reader.vercel.app";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
  };
}

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  corsHeaders: Record<string, string>
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  // CRITICAL: Build CORS headers FIRST, before any code that could throw
  const origin = req.headers.get("origin");
  const corsHeaders = buildCorsHeaders(origin);

  // Handle OPTIONS preflight immediately
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      console.error("Missing env: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
      return jsonResponse({ error: "server config error" }, 500, corsHeaders);
    }

    const url = new URL(req.url);
    const bookId = url.searchParams.get("bookId");

    if (!bookId) {
      return jsonResponse({ error: "missing bookId param" }, 400, corsHeaders);
    }

    // Get token from Authorization header
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      console.error("Missing auth header");
      return jsonResponse({ error: "missing auth header" }, 401, corsHeaders);
    }

    // Create admin client
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify the JWT and get user
    const { data: userResp, error: userError } = await supabase.auth.getUser(token);

    if (userError || !userResp?.user) {
      console.error("User verification failed:", userError?.message);
      return jsonResponse(
        { error: "invalid user", detail: userError?.message },
        401,
        corsHeaders
      );
    }

    const userId = userResp.user.id;
    console.log(`Generating book URL for user ${userId}, book ${bookId}`);

    // Check entitlement
    const { data: ent, error: entErr } = await supabase
      .from("entitlements")
      .select("active")
      .eq("user_id", userId)
      .eq("book_id", bookId)
      .maybeSingle();

    if (entErr) {
      console.error("Entitlement query error:", entErr.message);
      return jsonResponse({ error: "db error", detail: entErr.message }, 500, corsHeaders);
    }

    if (!ent?.active) {
      console.log("User does not have active entitlement");
      return jsonResponse({ error: "not entitled" }, 403, corsHeaders);
    }

    // Get book storage path
    const { data: book, error: bookErr } = await supabase
      .from("books")
      .select("storage_path")
      .eq("id", bookId)
      .maybeSingle();

    if (bookErr) {
      console.error("Book query error:", bookErr.message);
      return jsonResponse({ error: "db error", detail: bookErr.message }, 500, corsHeaders);
    }

    if (!book?.storage_path) {
      return jsonResponse({ error: "book not found" }, 404, corsHeaders);
    }

    // Generate signed URL
    const { data: signed, error: signErr } = await supabase.storage
      .from("books")
      .createSignedUrl(book.storage_path, SIGNED_URL_EXPIRY_SECONDS);

    if (signErr || !signed?.signedUrl) {
      console.error("Signed URL error:", signErr?.message);
      return jsonResponse({ error: "sign failed", detail: signErr?.message }, 500, corsHeaders);
    }

    console.log("Generated signed URL successfully");
    return jsonResponse(
      { url: signed.signedUrl, expiresIn: SIGNED_URL_EXPIRY_SECONDS },
      200,
      corsHeaders
    );
  } catch (err) {
    console.error("Exception in book-url:", err);
    return jsonResponse({ error: "exception", detail: String(err) }, 500, corsHeaders);
  }
});
