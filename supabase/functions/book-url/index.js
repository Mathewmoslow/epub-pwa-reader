import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("PROJECT_URL");
const supabaseKey = Deno.env.get("SERVICE_ROLE_KEY");
const bucket = Deno.env.get("BOOKS_BUCKET") || "books";
const signedSeconds = Number(Deno.env.get("SIGNED_EXP_SECONDS") || 600);

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing PROJECT_URL or SERVICE_ROLE_KEY");
}

export default async function handler(req) {
  if (req.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const bookId = new URL(req.url).searchParams.get("bookId");
  if (!bookId) {
    return Response.json({ error: "missing bookId" }, { status: 400 });
  }

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/bearer /i, "").trim();
  if (!token) {
    return Response.json({ error: "missing token" }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user) {
    return Response.json({ error: "invalid user" }, { status: 401 });
  }

  // Check entitlement
  const { data: ent, error: entErr } = await supabase
    .from("entitlements")
    .select("active")
    .eq("user_id", user.id)
    .eq("book_id", bookId)
    .maybeSingle();

  if (entErr) return Response.json({ error: "db error" }, { status: 500 });
  if (!ent?.active) return Response.json({ error: "revoked" }, { status: 403 });

  // Get path
  const { data: book, error: bookErr } = await supabase
    .from("books")
    .select("storage_path")
    .eq("id", bookId)
    .maybeSingle();

  if (bookErr || !book?.storage_path) {
    return Response.json({ error: "book missing" }, { status: 404 });
  }

  // Sign URL
  const { data: signed, error: signErr } = await supabase.storage
    .from(bucket)
    .createSignedUrl(book.storage_path, signedSeconds);

  if (signErr || !signed?.signedUrl) {
    return Response.json({ error: "sign failed" }, { status: 500 });
  }

  return Response.json({ url: signed.signedUrl, expiresIn: signedSeconds });
}
