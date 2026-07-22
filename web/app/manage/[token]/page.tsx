"use client";

import { use, useCallback, useEffect, useState } from "react";

type Conn = {
  source: "trakt" | "nuvio";
  trakt_username: string | null;
  nuvio_profile_id: number | null;
  wetrakr_username: string | null;
  live_enabled: boolean;
  last_watched_at: string | null;
  last_synced_at: string | null;
  last_error: string | null;
  created_at: string;
};

function ago(iso: string | null): string {
  if (!iso) return "never";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

const ERROR_TEXT: Record<string, string> = {
  wetrakr_auth:
    "WeTrakr rejected the token — pairing on another device may have rotated it. Disconnect here and pair again.",
  nuvio_auth:
    "Nuvio rejected the saved login — your password may have changed. Disconnect here and connect again.",
  trakt_403:
    "Your Trakt profile is set to private, so nothing can be read. Set it back to public in Trakt → Settings.",
  trakt_404: "Trakt no longer finds this username.",
};

export default function ManagePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [conn, setConn] = useState<Conn | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "missing">("loading");
  const [busy, setBusy] = useState(false);
  const [gone, setGone] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/manage/${token}`, { cache: "no-store" });
      if (r.status === 404) {
        setState("missing");
        return;
      }
      setConn(await r.json());
      setState("ok");
    } catch {
      setState("missing");
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleLive() {
    if (!conn) return;
    setBusy(true);
    await fetch(`/api/manage/${token}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ live_enabled: !conn.live_enabled }),
    });
    await load();
    setBusy(false);
  }

  async function disconnect() {
    if (
      !window.confirm(
        "Delete this connection? Relay forgets your WeTrakr token immediately. This can't be undone."
      )
    )
      return;
    setBusy(true);
    await fetch(`/api/manage/${token}`, { method: "DELETE" });
    setGone(true);
  }

  const isNuvio = conn?.source === "nuvio";

  return (
    <div className="wrap manage">
      <a className="brand" href="/">
        WeTrakr <em>Relay</em>
      </a>

      {gone ? (
        <>
          <h1 style={{ marginTop: 40 }}>Disconnected.</h1>
          <p style={{ color: "var(--muted)", marginTop: 12 }}>
            Your WeTrakr token and all sync data were deleted. You can pair
            again anytime from the <a href="/">start page</a>.
          </p>
        </>
      ) : state === "loading" ? (
        <p style={{ marginTop: 48, color: "var(--muted)" }}>Loading…</p>
      ) : state === "missing" ? (
        <>
          <h1 style={{ marginTop: 40 }}>Nothing here.</h1>
          <p style={{ color: "var(--muted)", marginTop: 12 }}>
            This manage link doesn&rsquo;t match a connection — it may have
            been deleted. Set up a new one from the{" "}
            <a href="/">start page</a>.
          </p>
        </>
      ) : conn ? (
        <>
          <h1 style={{ marginTop: 40 }}>Your relay</h1>

          <div className="status-card">
            <div className="status-row">
              <span className="k">Source</span>
              <span className="v">
                {isNuvio
                  ? `Nuvio · profile ${conn.nuvio_profile_id ?? "?"}`
                  : `Trakt · ${conn.trakt_username ?? "—"}`}
              </span>
            </div>
            <div className="status-row">
              <span className="k">WeTrakr account</span>
              <span className="v">{conn.wetrakr_username ?? "—"}</span>
            </div>
            {!isNuvio && (
              <div className="status-row">
                <span className="k">Live &ldquo;now playing&rdquo;</span>
                <span className="v">{conn.live_enabled ? "on" : "off"}</span>
              </div>
            )}
            <div className="status-row">
              <span className="k">Last sync</span>
              <span className="v">{ago(conn.last_synced_at)}</span>
            </div>
            <div className="status-row">
              <span className="k">Status</span>
              {conn.last_error ? (
                <span className="v err">
                  {ERROR_TEXT[conn.last_error] ?? conn.last_error}
                </span>
              ) : (
                <span className="v ok">healthy</span>
              )}
            </div>
          </div>

          <div className="manage-actions">
            {!isNuvio && (
              <button className="btn" onClick={toggleLive} disabled={busy}>
                {conn.live_enabled
                  ? "Turn live status off"
                  : "Turn live status on"}
              </button>
            )}
            <button className="btn danger" onClick={disconnect} disabled={busy}>
              Disconnect &amp; delete
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
