"use client";

import { useEffect, useRef, useState } from "react";

type Phase = "input" | "pairing" | "done";

const ERRORS: Record<string, string> = {
  invalid_username:
    "That doesn't look like a Trakt username. Use the slug from your profile URL: trakt.tv/users/<this-part>.",
  not_found:
    "Trakt doesn't know that username. Check the slug in your profile URL — it can differ from your display name.",
  private:
    "That profile is private, so Relay can't read its history. Set it to public in Trakt → Settings → Privacy, then try again.",
  expired:
    "The pairing code expired before it was entered. Start over to get a fresh one.",
  network: "Couldn't reach the server. Check your connection and try again.",
};

export default function ConnectWizard() {
  const [phase, setPhase] = useState<Phase>("input");
  const [username, setUsername] = useState("");
  const [live, setLive] = useState(false);
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

  async function start() {
    setError(null);
    setBusy(true);
    try {
      const r = await fetch("/api/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trakt_username: username, live }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(ERRORS[data.error] ?? "Something went wrong. Try again.");
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
            setError(ERRORS.expired);
          }
        } catch {
          /* nächster Tick versucht es erneut */
        }
      }, every);
    } catch {
      setError(ERRORS.network);
    } finally {
      setBusy(false);
    }
  }

  const stepClass = (step: Phase) => {
    const order: Phase[] = ["input", "pairing", "done"];
    const current = order.indexOf(phase);
    const mine = order.indexOf(step);
    if (mine < current) return "step-label done";
    if (mine === current) return "step-label active";
    return "step-label";
  };

  return (
    <div className="wizard">
      <h2>Connect in under a minute</h2>
      <p className="sub">
        One field, one code, done. Everything you watch from now on follows
        you to WeTrakr.
      </p>

      <div className="steps" aria-hidden="true">
        <span className={stepClass("input")}>1 · Trakt profile</span>
        <span className={stepClass("pairing")}>2 · Approve on WeTrakr</span>
        <span className={stepClass("done")}>3 · Relaying</span>
      </div>

      {phase === "input" && (
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

          <label className="check">
            <input
              type="checkbox"
              checked={live}
              onChange={(e) => setLive(e.target.checked)}
            />
            <span>
              Also mirror my live &ldquo;now playing&rdquo; status (polls
              Trakt once a minute while you watch)
            </span>
          </label>

          <p className="hint">
            Your profile needs to be public, and the username is the slug from
            your profile URL — trakt.tv/users/<b>this-part</b>.
          </p>

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
