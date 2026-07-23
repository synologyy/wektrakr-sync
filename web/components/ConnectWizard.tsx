"use client";

import { useEffect, useRef, useState } from "react";

type Phase = "input" | "nuvio_profiles" | "pairing" | "done";
type Source = "trakt" | "nuvio" | "stremio";
type NuvioProfile = {
  profile_index: number;
  name: string;
  avatar_color_hex: string | null;
};

const ERRORS: Record<string, string> = {
  invalid_username:
    "That doesn't look like a Trakt username. Use the slug from your profile URL: trakt.tv/users/<this-part>.",
  not_found:
    "Trakt doesn't know that username. Check the slug in your profile URL — it can differ from your display name.",
  private:
    "That profile is private, so Relay can't read its history. Set it to public in Trakt → Settings → Privacy, then try again.",
  invalid_login: "Enter your email and password.",
  nuvio_login:
    "Nuvio didn't accept those credentials. Check your email and password and try again.",
  stremio_login:
    "Stremio didn't accept those credentials. Check your email and password and try again.",
  expired:
    "The pairing code expired before it was entered. Start over to get a fresh one.",
  network: "Couldn't reach the server. Check your connection and try again.",
};

export default function ConnectWizard() {
  const [phase, setPhase] = useState<Phase>("input");
  const [source, setSource] = useState<Source>("trakt");

  // Trakt
  const [username, setUsername] = useState("");
  const [live, setLive] = useState(false);

  // Nuvio / Stremio (shared email + password)
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [profiles, setProfiles] = useState<NuvioProfile[]>([]);
  const [profileIndex, setProfileIndex] = useState<number | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [userCode, setUserCode] = useState("");
  const [verifyUrl, setVerifyUrl] = useState("");
  const [manageUrl, setManageUrl] = useState("");
  const [wetrakrUser, setWetrakrUser] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function fail(code: string) {
    setError(ERRORS[code] ?? "Something went wrong. Try again.");
  }

  function pickSource(s: Source) {
    setSource(s);
    setPhase("input");
    setError(null);
  }

  // Nuvio: sign in and load profiles
  async function loadProfiles() {
    setError(null);
    setBusy(true);
    try {
      const r = await fetch("/api/nuvio/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await r.json();
      if (!r.ok) {
        fail(data.error);
        return;
      }
      const list: NuvioProfile[] = data.profiles ?? [];
      setProfiles(list);
      setProfileIndex(list[0]?.profile_index ?? 1);
      setPhase("nuvio_profiles");
    } catch {
      fail("network");
    } finally {
      setBusy(false);
    }
  }

  // All sources: start the WeTrakr pairing
  async function start() {
    setError(null);
    setBusy(true);
    try {
      const body =
        source === "trakt"
          ? { source, trakt_username: username, live }
          : source === "stremio"
          ? { source, email, password, live }
          : { source, email, password, profile_index: profileIndex };
      const r = await fetch("/api/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) {
        fail(data.error);
        return;
      }
      setUserCode(data.user_code);
      setVerifyUrl(data.verification_url);
      setPhase("pairing");

      const every = Math.max(3, data.interval ?? 5) * 1000;
      pollRef.current = setInterval(async () => {
        try {
          const pr = await fetch(`/api/pair/${data.pairing_id}`);
          const pd = await pr.json();
          if (pd.status === "connected") {
            if (pollRef.current) clearInterval(pollRef.current);
            setWetrakrUser(pd.wetrakr_username);
            setManageUrl(
              pd.manage_url ??
                `${window.location.origin}/manage/${pd.manage_token}`
            );
            setPhase("done");
          } else if (pd.status === "expired") {
            if (pollRef.current) clearInterval(pollRef.current);
            setPhase("input");
            fail("expired");
          }
        } catch {
          /* next tick retries */
        }
      }, every);
    } catch {
      fail("network");
    } finally {
      setBusy(false);
    }
  }

  const stepClass = (step: Phase) => {
    const order: Phase[] = ["input", "pairing", "done"];
    const norm = phase === "nuvio_profiles" ? "input" : phase;
    const current = order.indexOf(norm);
    const mine = order.indexOf(step);
    if (mine < current) return "step-label done";
    if (mine === current) return "step-label active";
    return "step-label";
  };

  const canContinue =
    source === "trakt" ? !!username.trim() : !!email.trim() && !!password;

  const liveCheckbox = (
    <label className="check">
      <input
        type="checkbox"
        checked={live}
        onChange={(e) => setLive(e.target.checked)}
      />
      <span>
        Also mirror my live &ldquo;now playing&rdquo; status while you watch
      </span>
    </label>
  );

  return (
    <div className="wizard">
      <h2>Connect in under a minute</h2>
      <p className="sub">
        Pick your source, confirm one code, done. Everything you watch from now
        on follows you to WeTrakr.
      </p>

      <div className="steps" aria-hidden="true">
        <span className={stepClass("input")}>1 · Source</span>
        <span className={stepClass("pairing")}>2 · Approve on WeTrakr</span>
        <span className={stepClass("done")}>3 · Relaying</span>
      </div>

      {(phase === "input" || phase === "nuvio_profiles") && (
        <div className="source-tabs">
          <button
            className={`tab ${source === "trakt" ? "active" : ""}`}
            onClick={() => pickSource("trakt")}
            disabled={busy}
          >
            Trakt
          </button>
          <button
            className={`tab ${source === "nuvio" ? "active" : ""}`}
            onClick={() => pickSource("nuvio")}
            disabled={busy}
          >
            Nuvio
          </button>
          <button
            className={`tab ${source === "stremio" ? "active" : ""}`}
            onClick={() => pickSource("stremio")}
            disabled={busy}
          >
            Stremio
          </button>
        </div>
      )}

      {phase === "input" && source === "trakt" && (
        <div>
          <div className="field-row">
            <input
              type="text"
              placeholder="your-trakt-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && username && !busy) start();
              }}
              aria-label="Trakt username"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              className="btn primary"
              onClick={start}
              disabled={!username.trim() || busy}
            >
              {busy ? "Checking…" : "Start pairing"}
            </button>
          </div>
          {liveCheckbox}
          <p className="hint">
            Your profile needs to be public, and the username is the slug from
            your profile URL — trakt.tv/users/<b>this-part</b>.
          </p>
          {error && <div className="error">{error}</div>}
        </div>
      )}

      {phase === "input" && source === "nuvio" && (
        <div>
          <div className="col-form">
            <input
              type="email"
              placeholder="Nuvio email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-label="Nuvio email"
              autoComplete="email"
              spellCheck={false}
            />
            <input
              type="password"
              placeholder="Nuvio password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canContinue && !busy) loadProfiles();
              }}
              aria-label="Nuvio password"
              autoComplete="current-password"
            />
            <button
              className="btn primary"
              onClick={loadProfiles}
              disabled={!canContinue || busy}
            >
              {busy ? "Signing in…" : "Continue"}
            </button>
          </div>
          <p className="hint">
            Relay signs in to read your Nuvio watch history. Your password is
            used only to sign in and is never stored — only a refresh token is
            kept.
          </p>
          {error && <div className="error">{error}</div>}
        </div>
      )}

      {phase === "input" && source === "stremio" && (
        <div>
          <div className="col-form">
            <input
              type="email"
              placeholder="Stremio email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-label="Stremio email"
              autoComplete="email"
              spellCheck={false}
            />
            <input
              type="password"
              placeholder="Stremio password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canContinue && !busy) start();
              }}
              aria-label="Stremio password"
              autoComplete="current-password"
            />
            <button
              className="btn primary"
              onClick={start}
              disabled={!canContinue || busy}
            >
              {busy ? "Signing in…" : "Start pairing"}
            </button>
          </div>
          {liveCheckbox}
          <p className="hint">
            Relay signs in to read your Stremio library. Your password is used
            only to sign in and is never stored — only an auth token is kept.
          </p>
          {error && <div className="error">{error}</div>}
        </div>
      )}

      {phase === "nuvio_profiles" && (
        <div>
          <p className="sub">Which Nuvio profile should Relay mirror?</p>
          <div className="profiles">
            {profiles.map((p) => (
              <button
                key={p.profile_index}
                className={`btn ${
                  profileIndex === p.profile_index ? "primary" : ""
                }`}
                onClick={() => setProfileIndex(p.profile_index)}
                disabled={busy}
              >
                {p.name}
              </button>
            ))}
          </div>
          <button
            className="btn primary"
            onClick={start}
            disabled={profileIndex == null || busy}
          >
            {busy ? "Starting…" : "Start pairing"}
          </button>
          {error && <div className="error">{error}</div>}
        </div>
      )}

      {phase === "pairing" && (
        <div className="code-panel">
          <p className="where">
            Enter this code at{" "}
            <a href={verifyUrl} target="_blank" rel="noreferrer">
              {verifyUrl.replace(/^https?:\/\//, "")}
            </a>
          </p>
          <div className="user-code">{userCode}</div>
          <p className="waiting">Waiting for you to approve</p>
        </div>
      )}

      {phase === "done" && (
        <div className="success">
          <div className="big" aria-hidden="true">
            ✓
          </div>
          <h3>
            Relaying{wetrakrUser ? ` for ${wetrakrUser}` : ""} — you&rsquo;re
            done.
          </h3>
          <p>
            New watches appear on WeTrakr within five minutes. Bookmark your
            manage link — it&rsquo;s the only key to this connection, and we
            can&rsquo;t recover it for you:
          </p>
          <div className="manage-link">
            <a href={manageUrl}>{manageUrl}</a>
          </div>
        </div>
      )}
    </div>
  );
}
