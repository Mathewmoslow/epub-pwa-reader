import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("PROJECT_URL");
const supabaseKey = Deno.env.get("SERVICE_ROLE_KEY");

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing PROJECT_URL or SERVICE_ROLE_KEY");
}

export default async function handler(req) {
  if (req.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const bookId = new URL(req.url).searchParams.get("bookId");
  if (!bookId) {
    return Response.json({ active: false, reason: "missing bookId" }, { status: 400 });
  }

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/bearer /i, "").trim();
  if (!token) {
    return Response.json({ active: false, reason: "missing token" }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user) {
    return Response.json({ active: false, reason: "invalid user" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("entitlements")
    .select("active")
    .eq("user_id", user.id)
    .eq("book_id", bookId)
    .maybeSingle();

  if (error) {
    return Response.json({ active: false, reason: "db error" }, { status: 500 });
  }

  const active = data?.active === true;
  return Response.json({ active, checkedAt: new Date().toISOString() });
}
