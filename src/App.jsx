import { useEffect, useState } from "react";

function formatDate(value) {
  if (!value) {
    return "N/A";
  }

  try {
    return new Intl.DateTimeFormat("tr-TR", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
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

export default function App() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [auth, setAuth] = useState({ loading: true, authenticated: false, username: "" });
  const [dashboard, setDashboard] = useState(null);
  const [error, setError] = useState("");
  const [syncBusy, setSyncBusy] = useState(false);

  const refreshDashboard = async () => {
    const response = await fetch("/admin/api/dashboard", { credentials: "same-origin" });
    if (!response.ok) {
      throw new Error("dashboard");
    }
    const data = await response.json();
    setDashboard(data);
  };

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
        setError(data.error || "Login failed");
        return;
      }

      setAuth({ loading: false, authenticated: true, username: data.username });
      setPassword("");
      setUsername("");
      await refreshDashboard();
    } catch {
      setError("Login request failed");
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
        setError(data.error || "Sync failed");
        return;
      }
      const data = await response.json();
      setDashboard(data);
    } catch {
      setError("Sync request failed");
    } finally {
      setSyncBusy(false);
    }
  };

  if (!auth.authenticated) {
    return (
      <main className="auth-shell">
        <section className="auth-panel">
          <div className="auth-band" />
          <p className="auth-eyebrow">InstaFetch Control Room</p>
          <h1>Bridge paneline giris yapin.</h1>
          <p className="auth-copy">
            Instagram, Discord ve webhook akislarini yoneten tek panel burada.
          </p>

          <form className="auth-form" onSubmit={handleLogin}>
            <label>
              Username
                <input
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="admin"
                />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="********"
              />
            </label>
            {error ? <p className="form-error">{error}</p> : null}
            <button type="submit" disabled={auth.loading}>
              {auth.loading ? "Kontrol ediliyor" : "Panele Gir"}
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
    <main className="dashboard-shell">
      <section className="masthead">
        <div className="masthead-copy">
          <p className="eyebrow">InstaFetch Admin</p>
          <h1>Webhook, sync ve medya akislarini tek bakista yonetin.</h1>
          <p className="lede">
            Panel artik sadece vitrin degil. Son sync zamani, manuel tetikleme, son
            gonderilen medya listesi ve webhook sagligi burada.
          </p>
        </div>

        <div className="masthead-actions">
          <div className="operator-card">
            <span>Aktif operator</span>
            <strong>{auth.username}</strong>
            <small>Mention: {service?.mention || "disabled"}</small>
          </div>
          <button className="ghost-button" type="button" onClick={handleLogout}>
            Cikis Yap
          </button>
        </div>
      </section>

      <section className="overview-grid">
        <article className="spotlight-card sync">
          <p className="card-label">Son Sync</p>
          <h2>{formatDate(sync?.completed_at || sync?.started_at)}</h2>
          <div className="metric-strip">
            <div>
              <span>Durum</span>
              <strong>{sync?.status || "idle"}</strong>
            </div>
            <div>
              <span>Processed</span>
              <strong>{sync?.processed_count ?? 0}</strong>
            </div>
            <div>
              <span>Sent</span>
              <strong>{sync?.sent_count ?? 0}</strong>
            </div>
          </div>
        </article>

        <article className="spotlight-card webhook">
          <p className="card-label">Webhook Durumu</p>
          <h2>{webhook?.status || "unknown"}</h2>
          <div className="metric-strip">
            <div>
              <span>Path</span>
              <strong>{webhook?.path || "/meta/webhook"}</strong>
            </div>
            <div>
              <span>Verify Token</span>
              <strong>{webhook?.verify_token_configured ? "configured" : "missing"}</strong>
            </div>
            <div>
              <span>Last Event</span>
              <strong>{formatDate(webhook?.last_received_at)}</strong>
            </div>
          </div>
        </article>

        <article className="command-card">
          <p className="card-label">Manual Control</p>
          <h2>Bridge komutlari</h2>
          <p>
            Polling araligi {service?.poll_interval_seconds ?? "?"} saniye. Gerekirse
            burada beklemeden yeni bir sync baslatabilirsiniz.
          </p>
          {error ? <p className="form-error">{error}</p> : null}
          <button type="button" onClick={handleSync} disabled={syncBusy}>
            {syncBusy ? "Sync calisiyor" : "Sync Now"}
          </button>
        </article>
      </section>

      <section className="detail-grid">
        <article className="panel-card media-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Recent Delivery</p>
              <h3>Son gonderilen post, reels ve story listesi</h3>
            </div>
            <span className="pill">{recentMedia.length} kayit</span>
          </div>

          <div className="media-list">
            {recentMedia.length === 0 ? (
              <div className="empty-state">Henuz kayit yok.</div>
            ) : (
              recentMedia.map((item) => (
                <article key={item.media_id} className={`media-item ${mediaTone(item.media_product_type)}`}>
                  <div className="media-item-top">
                    <span className="media-chip">{item.media_product_type}</span>
                    <time>{formatDate(item.sent_at)}</time>
                  </div>
                  <strong>{item.username || "Instagram"}</strong>
                  <p>{item.caption || "Caption yok. Link uzerinden kontrol edin."}</p>
                  <div className="media-meta">
                    <span>{item.media_type || "UNKNOWN"}</span>
                    <span>{item.media_id}</span>
                  </div>
                  <a href={item.permalink || item.media_url || "#"} target="_blank" rel="noreferrer">
                    Medyayi ac
                  </a>
                </article>
              ))
            )}
          </div>
        </article>

        <article className="panel-card service-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Service Health</p>
              <h3>Sistem ozetleri</h3>
            </div>
            <span className="pill subtle">live</span>
          </div>

          <div className="service-grid">
            <div className="service-tile">
              <span>Backfill Limit</span>
              <strong>{service?.backfill_limit ?? "?"}</strong>
            </div>
            <div className="service-tile">
              <span>Poll Interval</span>
              <strong>{service?.poll_interval_seconds ?? "?"}s</strong>
            </div>
            <div className="service-tile">
              <span>IG User ID</span>
              <strong>{service?.ig_user_id || "?"}</strong>
            </div>
            <div className="service-tile">
              <span>Token Hint</span>
              <strong>{service?.token_hint || "missing"}</strong>
            </div>
          </div>

          <div className="service-note">
            <strong>Not</strong>
            <p>
              Story takibi artik resmi `stories` endpointi ile geliyor. Bu panel hem
              scheduler hem manuel sync sonucunu ayni dashboard uzerinden gosterir.
            </p>
          </div>
        </article>
      </section>
    </main>
  );
}
