import { supabase } from "../supabaseClient";

const ENTITLEMENT_FUNCTION =
  import.meta.env.VITE_ENTITLEMENT_FUNCTION ||
  "https://mepbfnomrgifvijnvteh.functions.supabase.co/entitlement-status";

const BOOK_URL_FUNCTION =
  import.meta.env.VITE_BOOK_URL_FUNCTION ||
  "https://mepbfnomrgifvijnvteh.functions.supabase.co/book-url";

const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

async function getAuthHeaders() {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session?.access_token) {
    throw new Error("Not authenticated - please sign in");
  }

  return {
    Authorization: `Bearer ${session.access_token}`,
    apikey: ANON_KEY,
    "Content-Type": "application/json",
  };
}

export async function checkEntitlement(bookId) {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(
      `${ENTITLEMENT_FUNCTION}?bookId=${encodeURIComponent(bookId)}`,
      {
        method: "GET",
        headers,
        credentials: "include",
      }
    );

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("Entitlement check failed:", response.status, data);
      return {
        active: false,
        error: data.error || `HTTP ${response.status}`,
      };
    }
    return data;
  } catch (err) {
    console.error("Entitlement check exception:", err);
    return { active: false, error: err.message };
  }
}

export async function getBookUrl(bookId) {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(
      `${BOOK_URL_FUNCTION}?bookId=${encodeURIComponent(bookId)}`,
      {
        method: "GET",
        headers,
        credentials: "include",
      }
    );

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("Book URL fetch failed:", response.status, data);
      return { error: data.error || `HTTP ${response.status}` };
    }
    return data;
  } catch (err) {
    console.error("Book URL fetch exception:", err);
    return { error: err.message };
  }
}

export async function getEntitledBookUrl(bookId) {
  const entitlement = await checkEntitlement(bookId);
  if (!entitlement.active) {
    return { error: entitlement.error || "You do not have access to this book" };
  }
  return getBookUrl(bookId);
}
