import { useEffect, useState } from "react";
import ReaderPage from "./ReaderPage";
import { supabase } from "./supabaseClient";

const BOOK = {
  id: "a_novel_divorce",
  title: "A Novel Divorce",
};

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const current = supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => {
      authListener?.subscription?.unsubscribe?.();
      current.catch(() => {});
    };
  }, []);

  const onLogin = async (email, password) => {
    setAuthLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setAuthLoading(false);
    if (error) throw error;
    setSession(data.session);
  };

  const onSignup = async (email, password) => {
    setAuthLoading(true);
    const { data, error } = await supabase.auth.signUp({ email, password });
    setAuthLoading(false);
    if (error) throw error;
    setSession(data.session);
  };

  const onLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
  };

  if (authLoading) {
    return (
      <div className="centerScreen">
        <div className="authCard">
          <div className="authTitle">Loading…</div>
        </div>
      </div>
    );
  }

  if (!session) {
    return <AuthScreen onLogin={onLogin} onSignup={onSignup} loading={authLoading} />;
  }

  const accessToken = session.access_token;

  return (
    <div className="appRoot">
      <div className="appTopBar">
        <div className="appTitle">{BOOK.title}</div>
        <button className="iconBtn" onClick={onLogout}>
          Sign out
        </button>
      </div>
      <ReaderPage
        bookId={BOOK.id}
        title={BOOK.title}
        entitlementEndpoint={import.meta.env.VITE_ENTITLEMENT_FUNCTION}
        bookUrlEndpoint={import.meta.env.VITE_BOOK_URL_FUNCTION}
        accessToken={accessToken}
      />
    </div>
  );
}

function AuthScreen({ onLogin, onSignup, loading }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);

  const run = async (fn) => {
    setError(null);
    try {
      await fn(email, password);
    } catch (err) {
      setError(err.message || "Login failed");
    }
  };

  return (
    <div className="centerScreen">
      <div className="authCard">
        <div className="authTitle">Sign in</div>
        <label className="authLabel">
          Email
          <input
            className="authInput"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </label>
        <label className="authLabel">
          Password
          <input
            className="authInput"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </label>
        {error ? <div className="authError">{error}</div> : null}
        <div className="authActions">
          <button className="btn" disabled={loading} onClick={() => run(onLogin)}>
            {loading ? "..." : "Sign in"}
          </button>
          <button className="btnSecondary" disabled={loading} onClick={() => run(onSignup)}>
            Create account
          </button>
        </div>
      </div>
    </div>
  );
}
