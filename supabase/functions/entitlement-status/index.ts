import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("PROJECT_URL");
const supabaseKey = Deno.env.get("SERVICE_ROLE_KEY");

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
      return Response.json({ active: false, error: "missing env" }, { status: 500, headers: corsHeaders });
    }

    if (req.method !== "GET") {
      return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
    }

    const bookId = new URL(req.url).searchParams.get("bookId");
    if (!bookId) {
      return Response.json({ active: false, error: "missing bookId" }, { status: 400, headers: corsHeaders });
    }

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace(/bearer /i, "").trim();
    if (!token) {
      return Response.json({ active: false, error: "missing token" }, { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userResp, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userResp?.user) {
      return Response.json({ active: false, error: "invalid user", detail: userError?.message }, { status: 401, headers: corsHeaders });
    }

    const uid = userResp.user.id;
    const { data, error } = await supabase
      .from("entitlements")
      .select("active")
      .eq("user_id", uid)
      .eq("book_id", bookId)
      .maybeSingle();

    if (error) {
      return Response.json({ active: false, error: "db error", detail: error.message }, { status: 500, headers: corsHeaders });
    }

    const active = data?.active === true;
    return Response.json({ active, checkedAt: new Date().toISOString() }, { headers: corsHeaders });
  } catch (err) {
    return Response.json({ active: false, error: "exception", detail: `${err}` }, { status: 500, headers: corsHeaders });
  }
}
