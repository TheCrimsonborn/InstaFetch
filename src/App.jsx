import { useEffect, useState } from "react";

const copy = {
  en: {
    languageLabel: "Language",
    english: "English",
    turkish: "Türkçe",
    loginKicker: "InstaFetch",
    loginTitle: "Admin access",
    loginBody: "Manage sync, webhook, and recent deliveries.",
    username: "Username",
    password: "Password",
    usernamePlaceholder: "admin",
    passwordPlaceholder: "Enter password",
    checking: "Checking",
    signIn: "Sign in",
    loginFailed: "Login failed",
    loginRequestFailed: "Login request failed",
    title: "Dashboard",
    subtitle: "A simple control panel for the Instagram to Discord bridge.",
    activeUser: "User",
    mention: "Mention",
    disabled: "disabled",
    signOut: "Sign out",
    lastSync: "Last sync",
    status: "Status",
    processed: "Processed",
    sent: "Sent",
    idle: "idle",
    webhook: "Webhook",
    path: "Path",
    verifyToken: "Verify token",
    configured: "configured",
    missing: "missing",
    lastEvent: "Last event",
    unknown: "unknown",
    manualSync: "Manual sync",
    manualSyncBody: "Run a sync immediately.",
    syncNow: "Sync now",
    syncRunning: "Syncing",
    syncFailed: "Sync failed",
    syncRequestFailed: "Sync request failed",
    recentMedia: "Recent media",
    noMedia: "No records yet.",
    noCaption: "No caption",
    openMedia: "Open",
    instagram: "Instagram",
    service: "Service",
    backfill: "Backfill",
    interval: "Interval",
    igUserId: "IG user ID",
    tokenHint: "Token hint",
    live: "live",
    records: "{count} records",
    na: "N/A"
  },
  tr: {
    languageLabel: "Dil",
    english: "English",
    turkish: "Türkçe",
    loginKicker: "InstaFetch",
    loginTitle: "Yönetici girişi",
    loginBody: "Sync, webhook ve son teslimatları yönetin.",
    username: "Kullanıcı adı",
    password: "Şifre",
    usernamePlaceholder: "admin",
    passwordPlaceholder: "Şifreyi girin",
    checking: "Kontrol ediliyor",
    signIn: "Giriş yap",
    loginFailed: "Giriş başarısız",
    loginRequestFailed: "Giriş isteği başarısız oldu",
    title: "Panel",
    subtitle: "Instagram to Discord köprüsü için sade kontrol paneli.",
    activeUser: "Kullanıcı",
    mention: "Etiket",
    disabled: "kapalı",
    signOut: "Çıkış yap",
    lastSync: "Son sync",
    status: "Durum",
    processed: "İşlenen",
    sent: "Gönderilen",
    idle: "boşta",
    webhook: "Webhook",
    path: "Yol",
    verifyToken: "Doğrulama tokenı",
    configured: "tanımlı",
    missing: "eksik",
    lastEvent: "Son olay",
    unknown: "bilinmiyor",
    manualSync: "Manuel sync",
    manualSyncBody: "Hemen yeni bir sync çalıştırın.",
    syncNow: "Şimdi sync et",
    syncRunning: "Sync çalışıyor",
    syncFailed: "Sync başarısız",
    syncRequestFailed: "Sync isteği başarısız oldu",
    recentMedia: "Son medya",
    noMedia: "Henüz kayıt yok.",
    noCaption: "Açıklama yok",
    openMedia: "Aç",
    instagram: "Instagram",
    service: "Servis",
    backfill: "Backfill",
    interval: "Aralık",
    igUserId: "IG kullanıcı ID",
    tokenHint: "Token ipucu",
    live: "canlı",
    records: "{count} kayıt",
    na: "Yok"
  }
};

function interpolate(template, values) {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ""));
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatDate(value, locale, fallback) {
  if (!value) {
    return fallback;
  }

  try {
    const date = new Date(value);
    const day = pad(date.getDate());
    const month = pad(date.getMonth() + 1);
    const year = date.getFullYear();
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    return `${day}/${month}/${year}, ${hours}:${minutes}`;
  } catch {
    return value;
  }
}

function mediaTone(type) {
  switch (type) {
    case "STORY":
      return "story";
    case "REELS":
      return "reel";
    case "FEED":
      return "feed";
    default:
      return "generic";
  }
}

function LanguageToggle({ language, onChange, text }) {
  return (
    <div className="language-toggle" role="group" aria-label={text.languageLabel}>
      <button
        className={language === "en" ? "active" : ""}
        type="button"
        onClick={() => onChange("en")}
      >
        {text.english}
      </button>
      <button
        className={language === "tr" ? "active" : ""}
        type="button"
        onClick={() => onChange("tr")}
      >
        {text.turkish}
      </button>
    </div>
  );
}

function StatCard({ label, value, meta }) {
  return (
    <article className="stat-card">
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      <span className="stat-meta">{meta}</span>
    </article>
  );
}

function KeyValue({ label, value }) {
  return (
    <div className="key-value">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default function App() {
  const [language, setLanguage] = useState("en");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [auth, setAuth] = useState({ loading: true, authenticated: false, username: "" });
  const [dashboard, setDashboard] = useState(null);
  const [error, setError] = useState("");
  const [syncBusy, setSyncBusy] = useState(false);

  const text = copy[language];
  const locale = language === "tr" ? "tr-TR" : "en-US";

  const refreshDashboard = async () => {
    const response = await fetch("/admin/api/dashboard", { credentials: "same-origin" });
    if (!response.ok) {
      throw new Error("dashboard");
    }
    const data = await response.json();
    setDashboard(data);
  };

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const authResponse = await fetch("/admin/api/auth/me", { credentials: "same-origin" });
        if (!authResponse.ok) {
          setAuth({ loading: false, authenticated: false, username: "" });
          return;
        }
        const authData = await authResponse.json();
        setAuth({ loading: false, authenticated: true, username: authData.username });
        await refreshDashboard();
      } catch {
        setAuth({ loading: false, authenticated: false, username: "" });
      }
    };

    bootstrap();
  }, []);

  const handleLogin = async (event) => {
    event.preventDefault();
    setError("");

    try {
      const response = await fetch("/admin/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data.error || text.loginFailed);
        return;
      }

      setAuth({ loading: false, authenticated: true, username: data.username });
      setPassword("");
      setUsername("");
      await refreshDashboard();
    } catch {
      setError(text.loginRequestFailed);
    }
  };

  const handleLogout = async () => {
    await fetch("/admin/api/auth/logout", {
      method: "POST",
      credentials: "same-origin"
    });
    setDashboard(null);
    setAuth({ loading: false, authenticated: false, username: "" });
    setPassword("");
  };

  const handleSync = async () => {
    setSyncBusy(true);
    setError("");

    try {
      const response = await fetch("/admin/api/sync", {
        method: "POST",
        credentials: "same-origin"
      });
      if (!response.ok) {
        const data = await response.json();
        setError(data.error || text.syncFailed);
        return;
      }
      const data = await response.json();
      setDashboard(data);
    } catch {
      setError(text.syncRequestFailed);
    } finally {
      setSyncBusy(false);
    }
  };

  if (!auth.authenticated) {
    return (
      <main className="login-shell">
        <section className="login-card">
          <div className="login-topbar">
            <span className="kicker">{text.loginKicker}</span>
            <LanguageToggle language={language} onChange={setLanguage} text={text} />
          </div>
          <h1>{text.loginTitle}</h1>
          <p className="subtle">{text.loginBody}</p>

          <form className="login-form" onSubmit={handleLogin}>
            <label>
              {text.username}
              <input
                type="text"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder={text.usernamePlaceholder}
              />
            </label>
            <label>
              {text.password}
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={text.passwordPlaceholder}
              />
            </label>
            {error ? <p className="error-text">{error}</p> : null}
            <button type="submit" disabled={auth.loading}>
              {auth.loading ? text.checking : text.signIn}
            </button>
          </form>
        </section>
      </main>
    );
  }

  const sync = dashboard?.sync;
  const recentMedia = dashboard?.recent_media || [];
  const webhook = dashboard?.webhook;
  const service = dashboard?.service;

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <h1>{text.title}</h1>
          <p className="subtle">{text.subtitle}</p>
        </div>
        <div className="header-actions">
          <LanguageToggle language={language} onChange={setLanguage} text={text} />
          <button className="secondary-button" type="button" onClick={handleLogout}>
            {text.signOut}
          </button>
        </div>
      </header>

      <section className="summary-bar">
        <div className="summary-item">
          <span>{text.activeUser}</span>
          <strong>{auth.username}</strong>
        </div>
        <div className="summary-item">
          <span>{text.mention}</span>
          <strong>{service?.mention || text.disabled}</strong>
        </div>
        <div className="summary-item">
          <span>{text.webhook}</span>
          <strong>{webhook?.status || text.unknown}</strong>
        </div>
        <div className="summary-item">
          <span>{text.service}</span>
          <strong>{text.live}</strong>
        </div>
      </section>

      <section className="stats-grid">
        <StatCard
          label={text.lastSync}
          value={formatDate(sync?.completed_at || sync?.started_at, locale, text.na)}
          meta={`${text.status}: ${sync?.status || text.idle}`}
        />
        <StatCard
          label={text.processed}
          value={sync?.processed_count ?? 0}
          meta={`${text.sent}: ${sync?.sent_count ?? 0}`}
        />
        <StatCard
          label={text.webhook}
          value={webhook?.path || "/meta/webhook"}
          meta={`${text.lastEvent}: ${formatDate(webhook?.last_received_at, locale, text.na)}`}
        />
      </section>

      <section className="content-grid">
        <article className="panel">
          <div className="panel-header">
            <div>
              <h2>{text.recentMedia}</h2>
              <p className="subtle">{interpolate(text.records, { count: recentMedia.length })}</p>
            </div>
          </div>

          <div className="media-list">
            {recentMedia.length === 0 ? (
              <div className="empty-state">{text.noMedia}</div>
            ) : (
              recentMedia.map((item) => (
                <article key={item.media_id} className={`media-row ${mediaTone(item.media_product_type)}`}>
                  <div className="media-row-top">
                    <span className="media-type">{item.media_product_type}</span>
                    <time>{formatDate(item.sent_at, locale, text.na)}</time>
                  </div>
                  <strong>{item.username || text.instagram}</strong>
                  <p>{item.caption || text.noCaption}</p>
                  <div className="media-row-bottom">
                    <span>{item.media_type || text.unknown}</span>
                    <a href={item.permalink || item.media_url || "#"} target="_blank" rel="noreferrer">
                      {text.openMedia}
                    </a>
                  </div>
                </article>
              ))
            )}
          </div>
        </article>

        <aside className="side-stack">
          <article className="panel">
            <div className="panel-header">
              <div>
                <h2>{text.manualSync}</h2>
                <p className="subtle">{text.manualSyncBody}</p>
              </div>
            </div>
            {error ? <p className="error-text">{error}</p> : null}
            <button className="primary-button" type="button" onClick={handleSync} disabled={syncBusy}>
              {syncBusy ? text.syncRunning : text.syncNow}
            </button>
          </article>

          <article className="panel">
            <div className="panel-header">
              <div>
                <h2>{text.webhook}</h2>
              </div>
            </div>
            <div className="key-value-list">
              <KeyValue label={text.path} value={webhook?.path || "/meta/webhook"} />
              <KeyValue
                label={text.verifyToken}
                value={webhook?.verify_token_configured ? text.configured : text.missing}
              />
              <KeyValue
                label={text.lastEvent}
                value={formatDate(webhook?.last_received_at, locale, text.na)}
              />
            </div>
          </article>

          <article className="panel">
            <div className="panel-header">
              <div>
                <h2>{text.service}</h2>
              </div>
            </div>
            <div className="key-value-list">
              <KeyValue label={text.backfill} value={service?.backfill_limit ?? "?"} />
              <KeyValue label={text.interval} value={`${service?.poll_interval_seconds ?? "?"}s`} />
              <KeyValue label={text.igUserId} value={service?.ig_user_id || "?"} />
              <KeyValue label={text.tokenHint} value={service?.token_hint || text.missing} />
            </div>
          </article>
        </aside>
      </section>
    </main>
  );
}
