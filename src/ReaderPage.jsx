import { useEffect, useMemo, useRef, useState } from "react";
import ePub from "epubjs";
import { supabase } from "./supabaseClient";
import {
  checkEntitlement,
  getBookUrl,
  getEntitledBookUrl,
} from "./services/entitlementService";

const LS_KEYS = {
  settings: (bookId) => `reader_settings:${bookId}`,
  lastCfi: (bookId) => `reader_lastcfi:${bookId}`,
};

const DEFAULT_SETTINGS = {
  theme: "light",
  font: "serif",
  fontSizePx: 18,
  lineHeight: 1.5,
  marginPx: 30,
};

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function safeJsonParse(str, fallback) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

function themeVars(theme) {
  if (theme === "dark") {
    return {
      bg: "#0f0f12",
      fg: "#e9e9ee",
      muted: "#cdd0dc",
      chrome: "rgba(18,18,22,0.92)",
    };
  }
  if (theme === "sepia") {
    return {
      bg: "#f4ecd8",
      fg: "#2b241d",
      muted: "#3f3326",
      chrome: "rgba(244,236,216,0.94)",
    };
  }
  return {
    bg: "#ffffff",
    fg: "#121316",
    muted: "#2f3137",
    chrome: "rgba(255,255,255,0.92)",
  };
}

export default function ReaderPage({
  bookId,
  title,
  entitlementEndpoint,
  bookUrlEndpoint,
  accessToken,
}) {
  const containerRef = useRef(null);
  const renditionRef = useRef(null);
  const bookRef = useRef(null);

  const [locked, setLocked] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [toc, setToc] = useState([]);
  const tocRef = useRef([]);
  const [progress, setProgress] = useState({ pct: 0, chapterLabel: "" });
  const [sliderValue, setSliderValue] = useState(0);
  const [epubUrl, setEpubUrl] = useState(null);
  const [entitlementError, setEntitlementError] = useState(null);
  const [bookError, setBookError] = useState(null);
  const [authToken, setAuthToken] = useState(accessToken || null);

  const [settings, setSettings] = useState(() => {
    const stored = localStorage.getItem(LS_KEYS.settings(bookId));
    return stored
      ? { ...DEFAULT_SETTINGS, ...safeJsonParse(stored, {}) }
      : DEFAULT_SETTINGS;
  });

  const tv = useMemo(() => themeVars(settings.theme), [settings.theme]);

  useEffect(() => {
    localStorage.setItem(LS_KEYS.settings(bookId), JSON.stringify(settings));
  }, [settings, bookId]);

  // Keep an auth token locally (fallback to Supabase session if prop missing)
  useEffect(() => {
    let mounted = true;
    const sync = async () => {
      if (accessToken) {
        if (mounted) setAuthToken(accessToken);
        return;
      }
      const sess = await supabase.auth.getSession();
      const token = sess?.data?.session?.access_token;
      if (mounted) setAuthToken(token || null);
    };
    sync();
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (mounted) setAuthToken(session?.access_token || null);
    });
    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, [accessToken]);

  // Fetch signed EPUB URL when we have a token
  useEffect(() => {
    const fetchSigned = async () => {
      if (!bookUrlEndpoint) return;
      const result = await getBookUrl(bookId);
      if (result.error) {
        setEpubUrl(null);
        setBookError(result.error);
        return;
      }
      setBookError(null);
      setEpubUrl(result.url);
    };
    fetchSigned();
  }, [bookId, bookUrlEndpoint, accessToken]);

  useEffect(() => {
    let active = true;
    async function run() {
      const data = await checkEntitlement(bookId);
      if (!active) return;
      if (data.error) {
        setEntitlementError(data.error);
        setLocked(true);
        return;
      }
      setEntitlementError(null);
      setLocked(!data.active);
    }

    run();

    const interval = setInterval(run, 5 * 60 * 1000);
    const onVis = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      active = false;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [bookId, entitlementEndpoint, accessToken]);

  useEffect(() => {
    if (locked) {
      try {
        renditionRef.current?.destroy?.();
      } catch {}
      renditionRef.current = null;
      bookRef.current = null;
      return;
    }

    if (!containerRef.current || !epubUrl) return;

    try {
      renditionRef.current?.destroy?.();
    } catch {}
    renditionRef.current = null;

    const book = ePub(epubUrl, { openAs: "epub" });
    bookRef.current = book;

    const rendition = book.renderTo(containerRef.current, {
      width: "100%",
      height: "100%",
      flow: "paginated",
      spread: "auto",
      allowScriptedContent: false,
    });

    renditionRef.current = rendition;

    const applyTheme = () => {
      rendition.themes.register("light", {
        body: {
          background: "#ffffff !important",
          color: "#121316 !important",
          padding: `${settings.marginPx}px !important`,
        },
        p: { "line-height": `${settings.lineHeight} !important` },
        li: { "line-height": `${settings.lineHeight} !important` },
      });

      rendition.themes.register("sepia", {
        body: {
          background: "#f4ecd8 !important",
          color: "#2b241d !important",
          padding: `${settings.marginPx}px !important`,
        },
        p: { "line-height": `${settings.lineHeight} !important` },
        li: { "line-height": `${settings.lineHeight} !important` },
      });

      rendition.themes.register("dark", {
        body: {
          background: "#0f0f12 !important",
          color: "#e9e9ee !important",
          padding: `${settings.marginPx}px !important`,
        },
        p: { "line-height": `${settings.lineHeight} !important` },
        li: { "line-height": `${settings.lineHeight} !important` },
      });

      rendition.themes.select(settings.theme);

      const fontFamily =
        settings.font === "sans"
          ? "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
          : "ui-serif, Georgia, Times, 'Times New Roman', serif";

      rendition.themes.override("font-family", fontFamily);
      rendition.themes.fontSize(`${settings.fontSizePx}px`);

      rendition.themes.default({
        body: { padding: `${settings.marginPx}px !important` },
        p: { "line-height": `${settings.lineHeight} !important` },
        div: { "line-height": `${settings.lineHeight} !important` },
        li: { "line-height": `${settings.lineHeight} !important` },
        blockquote: { "line-height": `${settings.lineHeight} !important` },
      });
    };

    const updateProgressFromCfi = (cfi) => {
      const b = bookRef.current;
      if (!b || !b.locations || !b.locations.length()) return;

      const pct = b.locations.percentageFromCfi(cfi);
      const pctNum = Number.isFinite(pct) ? pct : 0;
      const pct100 = clamp(Math.round(pctNum * 10000) / 100, 0, 100);

      setProgress((prev) => ({ ...prev, pct: pct100 }));
      setSliderValue(clamp(Math.round(pctNum * 1000), 0, 1000));
      localStorage.setItem(LS_KEYS.lastCfi(bookId), cfi);
    };

    const onRelocated = (loc) => {
      const cfi = loc?.start?.cfi;
      if (cfi) updateProgressFromCfi(cfi);

      const href = loc?.start?.href;
      const tocList = tocRef.current;
      if (href && tocList?.length) {
        const found = findTocLabel(tocList, href);
        setProgress((prev) => ({
          ...prev,
          chapterLabel: found || prev.chapterLabel,
        }));
      }
    };

    rendition.on("relocated", onRelocated);

    book.loaded.navigation.then((nav) => {
      const list = nav.toc || [];
      tocRef.current = list;
      setToc(list);
    });

    book.ready
      .then(() => book.locations.generate(1600))
      .then(() => {
        applyTheme();

        const lastCfi = localStorage.getItem(LS_KEYS.lastCfi(bookId));
        if (lastCfi) return rendition.display(lastCfi);
        return rendition.display();
      })
      .catch(() => {
        applyTheme();
        rendition.display();
      });

    const settingsUnsub = () => applyTheme();

    return () => {
      rendition.off("relocated", onRelocated);
      try {
        rendition.destroy();
      } catch {}
      try {
        book.destroy();
      } catch {}
      renditionRef.current = null;
      bookRef.current = null;
      settingsUnsub();
    };
  }, [
    locked,
    epubUrl,
    bookId,
    settings.theme,
    settings.font,
    settings.fontSizePx,
    settings.lineHeight,
    settings.marginPx,
  ]);

  const swipeStateRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    moved: false,
  });

  const goPrev = () => renditionRef.current?.prev?.();
  const goNext = () => renditionRef.current?.next?.();

  const onTapZoneClick = (e) => {
    if (locked) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const w = rect.width;

    const leftEdge = w * 0.33;
    const rightEdge = w * 0.66;

    if (x < leftEdge) {
      goPrev();
    } else if (x > rightEdge) {
      goNext();
    } else {
      setChromeVisible((v) => !v);
      setTocOpen(false);
      setSettingsOpen(false);
    }
  };

  const onPointerDown = (e) => {
    const s = swipeStateRef.current;
    s.active = true;
    s.startX = e.clientX;
    s.startY = e.clientY;
    s.moved = false;
  };

  const onPointerMove = (e) => {
    const s = swipeStateRef.current;
    if (!s.active) return;
    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;
    if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) s.moved = true;
  };

  const onPointerUp = (e) => {
    const s = swipeStateRef.current;
    if (!s.active) return;
    s.active = false;

    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;

    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) goNext();
      else goPrev();
    }
  };

  const jumpToPct = (pct0to1) => {
    const book = bookRef.current;
    const rendition = renditionRef.current;
    if (!book || !rendition || !book.locations || !book.locations.length())
      return;
    const pct = clamp(pct0to1, 0, 1);
    const cfi = book.locations.cfiFromPercentage(pct);
    if (cfi) rendition.display(cfi);
  };

  const onScrubCommit = (val0to1000) => {
    jumpToPct(val0to1000 / 1000);
  };

  const onSelectTocItem = async (href) => {
    const rendition = renditionRef.current;
    if (!rendition) return;
    setTocOpen(false);
    setSettingsOpen(false);
    setChromeVisible(false);
    await rendition.display(href);
  };

  const setTheme = (theme) => setSettings((s) => ({ ...s, theme }));
  const setFont = (font) => setSettings((s) => ({ ...s, font }));

  const bump = (key, delta, min, max) => {
    setSettings((s) => ({ ...s, [key]: clamp(s[key] + delta, min, max) }));
  };

  return (
    <div
      className="readerShell"
      style={{
        background: tv.bg,
        color: tv.fg,
      }}
    >
      <div className="readerViewport" ref={containerRef} />

      <div
        className="tapOverlay"
        onClick={onTapZoneClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        role="button"
        aria-label="Reader tap zones"
        tabIndex={0}
      />

      <ReaderChrome
        visible={chromeVisible}
        title={title}
        tv={tv}
        pct={progress.pct}
        chapterLabel={progress.chapterLabel}
        sliderValue={sliderValue}
        onBack={() => {
          setChromeVisible(false);
          setTocOpen(false);
          setSettingsOpen(false);
        }}
        onOpenToc={() => {
          setChromeVisible(true);
          setSettingsOpen(false);
          setTocOpen(true);
        }}
        onOpenSettings={() => {
          setChromeVisible(true);
          setTocOpen(false);
          setSettingsOpen(true);
        }}
        onSliderChange={(v) => setSliderValue(v)}
        onSliderCommit={(v) => onScrubCommit(v)}
      />

      <Drawer open={tocOpen} title="Contents" tv={tv} onClose={() => setTocOpen(false)}>
        <TOC toc={toc} onSelect={onSelectTocItem} tv={tv} />
      </Drawer>

      <Drawer
        open={settingsOpen}
        title="Reading Settings"
        tv={tv}
        onClose={() => setSettingsOpen(false)}
      >
        <SettingsPanel
          settings={settings}
          onTheme={setTheme}
          onFont={setFont}
          onBump={bump}
          tv={tv}
        />
      </Drawer>

      {!locked && !epubUrl && (
        <div className="lockedOverlay" style={{ background: tv.bg, color: tv.fg }}>
          <div className="lockedCard" style={{ borderColor: "rgba(120,120,140,0.25)" }}>
            <div className="lockedTitle">Loading book…</div>
            <div className="lockedText" style={{ color: tv.muted }}>
      {bookError || "Requesting access."}
    </div>
    {bookError ? (
      <div className="lockedActions">
        <button
          className="btn"
          onClick={() => {
            setEpubUrl(null);
            setBookError(null);
            window.location.reload();
          }}
        >
          Retry
        </button>
      </div>
            ) : null}
          </div>
        </div>
      )}

      {locked && (
        <div className="lockedOverlay" style={{ background: tv.bg, color: tv.fg }}>
          <div className="lockedCard" style={{ borderColor: "rgba(120,120,140,0.25)" }}>
            <div className="lockedTitle">This book is currently unavailable</div>
            <div className="lockedText" style={{ color: tv.muted }}>
              Access has been turned off.
            </div>
            {entitlementError ? (
              <div className="lockedText" style={{ color: tv.muted }}>
                {entitlementError}
              </div>
            ) : null}
            <div className="lockedText" style={{ color: tv.muted, fontSize: 12 }}>
              Make sure you are signed in and entitled.
            </div>
            <div className="lockedActions">
              <button
                className="btn"
                onClick={async () => {
                  const controller = new AbortController();
                  if (!entitlementEndpoint || !accessToken) {
                    setEntitlementError("Not authenticated");
                    setLocked(true);
                    return;
                  }
                  try {
                    const url = new URL(entitlementEndpoint);
                    url.searchParams.set("bookId", bookId);
                    const res = await fetch(url.toString(), {
                      headers: { Authorization: `Bearer ${accessToken}` },
                      signal: controller.signal,
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) {
                      setEntitlementError(data.error || res.statusText || "Entitlement error");
                      setLocked(true);
                    } else {
                      setEntitlementError(null);
                      setLocked(!data.active);
                    }
                  } catch (err) {
                    setEntitlementError(String(err));
                    setLocked(true);
                  }
                }}
              >
                Check again
              </button>
              <button className="btnSecondary" onClick={() => {}}>
                Back
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReaderChrome({
  visible,
  title,
  tv,
  pct,
  chapterLabel,
  sliderValue,
  onBack,
  onOpenToc,
  onOpenSettings,
  onSliderChange,
  onSliderCommit,
}) {
  return (
    <div className={`chrome ${visible ? "chromeVisible" : ""}`}>
      <div className="topBar" style={{ background: tv.chrome, color: tv.fg }}>
        <button className="iconBtn" onClick={onBack} aria-label="Back">
          {"<"}
        </button>
        <div className="topTitle">{title}</div>
        <div className="topActions">
          <button className="iconBtn" onClick={onOpenSettings} aria-label="Reading settings">
            Aa
          </button>
          <button className="iconBtn" onClick={onOpenToc} aria-label="Table of contents">
            TOC
          </button>
        </div>
      </div>

      <div className="bottomBar" style={{ background: tv.chrome, color: tv.fg }}>
        <div className="progressRow">
          <div className="progressLeft">{progressText(pct)}</div>
          <div className="progressCenter" style={{ color: tv.muted }}>
            {chapterLabel || ""}
          </div>
        </div>

        <input
          className="scrubber"
          type="range"
          min={0}
          max={1000}
          value={sliderValue}
          onChange={(e) => onSliderChange(Number(e.target.value))}
          onMouseUp={(e) => onSliderCommit(Number(e.target.value))}
          onTouchEnd={(e) => onSliderCommit(Number(e.target.value))}
          aria-label="Progress scrubber"
        />
      </div>
    </div>
  );
}

function Drawer({ open, title, tv, onClose, children }) {
  return (
    <div className={`drawer ${open ? "drawerOpen" : ""}`}>
      <div className="drawerHeader" style={{ background: tv.chrome, color: tv.fg }}>
        <div className="drawerTitle">{title}</div>
        <button className="iconBtn" onClick={onClose} aria-label="Close drawer">
          x
        </button>
      </div>
      <div className="drawerBody" style={{ background: tv.bg, color: tv.fg }}>
        {children}
      </div>
    </div>
  );
}

function TOC({ toc, onSelect, tv }) {
  if (!toc?.length) {
    return (
      <div className="emptyState" style={{ color: tv.muted }}>
        No table of contents found.
      </div>
    );
  }

  return (
    <div className="tocList">
      {toc.map((item) => (
        <TocItem
          key={item.id || item.href}
          item={item}
          onSelect={onSelect}
          level={0}
          tv={tv}
        />
      ))}
    </div>
  );
}

function TocItem({ item, onSelect, level, tv }) {
  return (
    <div className="tocItemWrap">
      <button
        className="tocItem"
        style={{ paddingLeft: 14 + level * 14 }}
        onClick={() => onSelect(item.href)}
      >
        <span className="tocLabel">{item.label}</span>
      </button>
      {item.subitems?.length ? (
        <div className="tocSub">
          {item.subitems.map((sub) => (
            <TocItem
              key={sub.id || sub.href}
              item={sub}
              onSelect={onSelect}
              level={level + 1}
              tv={tv}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SettingsPanel({ settings, onTheme, onFont, onBump, tv }) {
  return (
    <div className="settingsPanel">
      <div className="settingsSection">
        <div className="settingsLabel">Theme</div>
        <div className="segmented">
          <button
            className={settings.theme === "light" ? "segBtn segActive" : "segBtn"}
            onClick={() => onTheme("light")}
          >
            Light
          </button>
          <button
            className={settings.theme === "sepia" ? "segBtn segActive" : "segBtn"}
            onClick={() => onTheme("sepia")}
          >
            Sepia
          </button>
          <button
            className={settings.theme === "dark" ? "segBtn segActive" : "segBtn"}
            onClick={() => onTheme("dark")}
          >
            Dark
          </button>
        </div>
      </div>

      <div className="settingsSection">
        <div className="settingsLabel">Font</div>
        <div className="segmented">
          <button
            className={settings.font === "serif" ? "segBtn segActive" : "segBtn"}
            onClick={() => onFont("serif")}
          >
            Serif
          </button>
          <button
            className={settings.font === "sans" ? "segBtn segActive" : "segBtn"}
            onClick={() => onFont("sans")}
          >
            Sans
          </button>
        </div>
      </div>

      <div className="settingsSection">
        <div className="settingsLabel">Size</div>
        <div className="stepper">
          <button
            className="stepBtn"
            onClick={() => onBump("fontSizePx", -1, 12, 34)}
          >
            -
          </button>
          <div className="stepVal" style={{ color: tv.muted }}>
            {settings.fontSizePx}px
          </div>
          <button
            className="stepBtn"
            onClick={() => onBump("fontSizePx", +1, 12, 34)}
          >
            +
          </button>
        </div>
      </div>

      <div className="settingsSection">
        <div className="settingsLabel">Line spacing</div>
        <div className="stepper">
          <button
            className="stepBtn"
            onClick={() => onBump("lineHeight", -0.05, 1.1, 2.0)}
          >
            -
          </button>
          <div className="stepVal" style={{ color: tv.muted }}>
            {settings.lineHeight.toFixed(2)}
          </div>
          <button
            className="stepBtn"
            onClick={() => onBump("lineHeight", +0.05, 1.1, 2.0)}
          >
            +
          </button>
        </div>
      </div>

      <div className="settingsSection">
        <div className="settingsLabel">Margins</div>
        <div className="stepper">
          <button className="stepBtn" onClick={() => onBump("marginPx", -4, 6, 80)}>
            -
          </button>
          <div className="stepVal" style={{ color: tv.muted }}>
            {settings.marginPx}px
          </div>
          <button className="stepBtn" onClick={() => onBump("marginPx", +4, 6, 80)}>
            +
          </button>
        </div>
      </div>

      <div className="settingsHint" style={{ color: tv.muted }}>
        Page curl is possible later, but the MVP uses a fast slide turn.
      </div>
    </div>
  );
}

function findTocLabel(toc, href) {
  for (const item of toc) {
    if (item.href === href) return item.label;
    if (item.subitems?.length) {
      const found = findTocLabel(item.subitems, href);
      if (found) return found;
    }
  }
  return "";
}

function progressText(pct) {
  return `${pct.toFixed(2)}%`;
}
