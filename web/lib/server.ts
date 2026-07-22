// Server-only helper. Never import from client components.

import { Pool } from "pg";

const TRAKT_CLIENT_ID = process.env.TRAKT_CLIENT_ID!;
const WETRAKR_BASE = process.env.WETRAKR_API_URL ?? "https://api.wetrakr.com";
const NUVIO_BASE = process.env.NUVIO_API_URL ?? "https://api.nuvio.tv";
const NUVIO_KEY =
  process.env.NUVIO_PUBLISHABLE_KEY ??
  "sb_publishable_1Clq8rlTVACkdcZuqr6_AD__xUUC_EN";
const UA = "WeTrakr-Kodi/1.1.9";

// ── Postgres ─────────────────────────────────────────────────────

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export type Source = "trakt" | "nuvio";

export async function insertPairing(p: {
  source: Source;
  trakt_username?: string | null;
  nuvio_refresh_token?: string | null;
  nuvio_profile_id?: number | null;
  live_enabled: boolean;
  device_code: string;
  expires_at: string;
}): Promise<{ id: string }> {
  const r = await pool.query(
    `insert into pairings
       (source, trakt_username, nuvio_refresh_token, nuvio_profile_id,
        live_enabled, device_code, expires_at)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id`,
    [
      p.source,
      p.trakt_username ?? null,
      p.nuvio_refresh_token ?? null,
      p.nuvio_profile_id ?? null,
      p.live_enabled,
      p.device_code,
      p.expires_at,
    ]
  );
  return r.rows[0];
}

export type Pairing = {
  id: string;
  source: Source;
  trakt_username: string | null;
  nuvio_refresh_token: string | null;
  nuvio_profile_id: number | null;
  live_enabled: boolean;
  device_code: string;
  expires_at: string;
};

export async function getPairing(id: string): Promise<Pairing | null> {
  const r = await pool.query(
    `select id, source, trakt_username, nuvio_refresh_token, nuvio_profile_id,
            live_enabled, device_code, expires_at
     from pairings where id = $1`,
    [id]
  );
  return r.rows[0] ?? null;
}

export async function deletePairing(id: string): Promise<void> {
  await pool.query(`delete from pairings where id = $1`, [id]);
}

export async function insertConnection(c: {
  source: Source;
  trakt_username?: string | null;
  nuvio_refresh_token?: string | null;
  nuvio_profile_id?: number | null;
  wetrakr_token: string;
  wetrakr_username: string | null;
  live_enabled: boolean;
}): Promise<{ manage_token: string }> {
  const r = await pool.query(
    `insert into connections
       (source, trakt_username, nuvio_refresh_token, nuvio_profile_id,
        wetrakr_token, wetrakr_username, live_enabled)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning manage_token`,
    [
      c.source,
      c.trakt_username ?? null,
      c.nuvio_refresh_token ?? null,
      c.nuvio_profile_id ?? null,
      c.wetrakr_token,
      c.wetrakr_username,
      c.live_enabled,
    ]
  );
  return r.rows[0];
}

export type ManageConn = {
  source: Source;
  trakt_username: string | null;
  nuvio_profile_id: number | null;
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
    `select source, trakt_username, nuvio_profile_id, wetrakr_username,
            live_enabled, last_watched_at, last_synced_at, last_error, created_at
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

// ── Nuvio: sign in + list profiles (public API, Supabase-backed) ──

export type NuvioProfile = {
  profile_index: number;
  name: string;
  avatar_color_hex: string | null;
};

function nuvioHeaders(accessToken?: string): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: NUVIO_KEY,
    "User-Agent": UA,
  };
  if (accessToken) h["Authorization"] = `Bearer ${accessToken}`;
  return h;
}

export async function nuvioSignIn(
  email: string,
  password: string
): Promise<{ access_token: string; refresh_token: string }> {
  const r = await fetch(`${NUVIO_BASE}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: nuvioHeaders(),
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });
  if (!r.ok) throw new Error("nuvio_login");
  const d = await r.json();
  if (
    typeof d.access_token !== "string" ||
    typeof d.refresh_token !== "string"
  ) {
    throw new Error("nuvio_login");
  }
  return { access_token: d.access_token, refresh_token: d.refresh_token };
}

export async function nuvioListProfiles(
  accessToken: string
): Promise<NuvioProfile[]> {
  const r = await fetch(`${NUVIO_BASE}/rest/v1/rpc/sync_pull_profiles`, {
    method: "POST",
    headers: nuvioHeaders(accessToken),
    body: "{}",
    cache: "no-store",
  });
  if (!r.ok) throw new Error("nuvio_profiles");
  const rows = (await r.json()) as Array<Record<string, unknown>>;
  return rows
    .map((p) => ({
      profile_index: Number(p.profile_index),
      name: String(p.name ?? `Profile ${p.profile_index}`),
      avatar_color_hex:
        typeof p.avatar_color_hex === "string" ? p.avatar_color_hex : null,
    }))
    .filter((p) => Number.isInteger(p.profile_index))
    .sort((a, b) => a.profile_index - b.profile_index);
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
