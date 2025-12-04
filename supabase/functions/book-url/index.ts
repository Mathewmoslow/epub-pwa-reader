import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("PROJECT_URL");
const supabaseKey = Deno.env.get("SERVICE_ROLE_KEY");
const bucket = Deno.env.get("BOOKS_BUCKET") || "books";
const signedSeconds = Number(Deno.env.get("SIGNED_EXP_SECONDS") || 600);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

export default async function handler(req: Request) {
  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (!supabaseUrl || !supabaseKey) {
      return Response.json({ error: "missing env" }, { status: 500, headers: corsHeaders });
    }

    if (req.method !== "GET") {
      return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
    }

    const bookId = new URL(req.url).searchParams.get("bookId");
    if (!bookId) {
      return Response.json({ error: "missing bookId" }, { status: 400, headers: corsHeaders });
    }

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace(/bearer /i, "").trim();
    if (!token) {
      return Response.json({ error: "missing token" }, { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userResp, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userResp?.user) {
      return Response.json({ error: "invalid user", detail: userError?.message }, { status: 401, headers: corsHeaders });
    }

    const uid = userResp.user.id;
    const { data: ent, error: entErr } = await supabase
      .from("entitlements")
      .select("active")
      .eq("user_id", uid)
      .eq("book_id", bookId)
      .maybeSingle();

    if (entErr) return Response.json({ error: "db error", detail: entErr.message }, { status: 500, headers: corsHeaders });
    if (!ent?.active) return Response.json({ error: "revoked" }, { status: 403, headers: corsHeaders });

    const { data: book, error: bookErr } = await supabase
      .from("books")
      .select("storage_path")
      .eq("id", bookId)
      .maybeSingle();

    if (bookErr) return Response.json({ error: "db error", detail: bookErr.message }, { status: 500, headers: corsHeaders });
    if (!book?.storage_path) {
      return Response.json({ error: "book missing" }, { status: 404, headers: corsHeaders });
    }

    const { data: signed, error: signErr } = await supabase.storage
      .from(bucket)
      .createSignedUrl(book.storage_path, signedSeconds);

    if (signErr || !signed?.signedUrl) {
      return Response.json({ error: "sign failed", detail: signErr?.message }, { status: 500, headers: corsHeaders });
    }

    return Response.json({ url: signed.signedUrl, expiresIn: signedSeconds }, { headers: corsHeaders });
  } catch (err) {
    return Response.json({ error: "exception", detail: `${err}` }, { status: 500, headers: corsHeaders });
  }
}
