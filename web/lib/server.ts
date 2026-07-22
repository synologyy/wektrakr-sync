// Server-only helper. Never import from client components.

import { Pool } from "pg";

const TRAKT_CLIENT_ID = process.env.TRAKT_CLIENT_ID!;
const WETRAKR_BASE = process.env.WETRAKR_API_URL ?? "https://api.wetrakr.com";
const UA = "WeTrakr-Kodi/1.1.9";

// ── Postgres ─────────────────────────────────────────────────────

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function insertPairing(p: {
  trakt_username: string;
  live_enabled: boolean;
  device_code: string;
  expires_at: string;
}): Promise<{ id: string }> {
  const r = await pool.query(
    `insert into pairings (trakt_username, live_enabled, device_code, expires_at)
     values ($1, $2, $3, $4) returning id`,
    [p.trakt_username, p.live_enabled, p.device_code, p.expires_at]
  );
  return r.rows[0];
}

export type Pairing = {
  id: string;
  trakt_username: string;
  live_enabled: boolean;
  device_code: string;
  expires_at: string;
};

export async function getPairing(id: string): Promise<Pairing | null> {
  const r = await pool.query(
    `select id, trakt_username, live_enabled, device_code, expires_at
     from pairings where id = $1`,
    [id]
  );
  return r.rows[0] ?? null;
}

export async function deletePairing(id: string): Promise<void> {
  await pool.query(`delete from pairings where id = $1`, [id]);
}

export async function insertConnection(c: {
  trakt_username: string;
  wetrakr_token: string;
  wetrakr_username: string | null;
  live_enabled: boolean;
}): Promise<{ manage_token: string }> {
  const r = await pool.query(
    `insert into connections (trakt_username, wetrakr_token, wetrakr_username, live_enabled)
     values ($1, $2, $3, $4) returning manage_token`,
    [c.trakt_username, c.wetrakr_token, c.wetrakr_username, c.live_enabled]
  );
  return r.rows[0];
}

export type ManageConn = {
  trakt_username: string;
  wetrakr_username: string | null;
  live_enabled: boolean;
  last_watched_at: string | null;
  last_synced_at: string | null;
  last_error: string | null;
  created_at: string;
};

export async function getConnectionByManageToken(
  token: string
): Promise<ManageConn | null> {
  const r = await pool.query(
    `select trakt_username, wetrakr_username, live_enabled,
            last_watched_at, last_synced_at, last_error, created_at
     from connections where manage_token = $1`,
    [token]
  );
  return r.rows[0] ?? null;
}

export async function setConnectionLive(
  token: string,
  live: boolean
): Promise<void> {
  await pool.query(
    `update connections set live_enabled = $2 where manage_token = $1`,
    [token, live]
  );
}

export async function deleteConnection(token: string): Promise<void> {
  await pool.query(`delete from connections where manage_token = $1`, [token]);
}

// ── Trakt: check profile (public endpoints only) ─────────────────

export async function checkTraktProfile(
  username: string
): Promise<"ok" | "private" | "not_found"> {
  const r = await fetch(
    `https://api.trakt.tv/users/${encodeURIComponent(username)}/history?limit=1`,
    {
      headers: {
        "Content-Type": "application/json",
        "trakt-api-version": "2",
        "trakt-api-key": TRAKT_CLIENT_ID,
        "User-Agent": UA,
      },
      cache: "no-store",
    }
  );
  if (r.status === 404) return "not_found";
  if (r.status === 403) return "private";
  if (!r.ok) throw new Error(`trakt: ${r.status}`);
  return "ok";
}

// ── WeTrakr: device-code flow (unofficial, from the Kodi add-on) ──

export type DeviceCode = {
  device_code: string;
  user_code: string;
  verification_url: string;
  expires_in: number;
  interval: number;
};

export async function wetrakrDeviceCode(): Promise<DeviceCode> {
  const r = await fetch(`${WETRAKR_BASE}/oauth/device/code`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA },
    body: "{}",
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`wetrakr device code: ${r.status}`);
  return r.json();
}

export async function wetrakrPollToken(
  deviceCode: string
): Promise<
  | { status: "connected"; access_token: string; username?: string }
  | { status: "pending" }
  | { status: "expired" }
> {
  const r = await fetch(`${WETRAKR_BASE}/oauth/device/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA },
    body: JSON.stringify({ device_code: deviceCode }),
    cache: "no-store",
  });
  let data: Record<string, unknown> = {};
  try {
    data = await r.json();
  } catch {
    /* empty body */
  }
  if (typeof data.access_token === "string") {
    return {
      status: "connected",
      access_token: data.access_token,
      username: typeof data.username === "string" ? data.username : undefined,
    };
  }
  if (data.error === "expired_token") return { status: "expired" };
  return { status: "pending" };
}
