// Server-only Helper. Niemals in Client-Komponenten importieren.

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const TRAKT_CLIENT_ID = process.env.TRAKT_CLIENT_ID!;
const WETRAKR_BASE = process.env.WETRAKR_API_URL ?? "https://api.wetrakr.com";
const UA = "WeTrakr-Kodi/1.1.9";

// ── Supabase (PostgREST) ─────────────────────────────────────────

function sbHeaders(extra: Record<string, string> = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

export async function sbSelect<T>(table: string, query: string): Promise<T[]> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: sbHeaders(),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`supabase select ${table}: ${r.status}`);
  return r.json();
}

export async function sbInsert<T>(table: string, row: object): Promise<T> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: sbHeaders({ Prefer: "return=representation" }),
    body: JSON.stringify(row),
  });
  if (!r.ok) throw new Error(`supabase insert ${table}: ${r.status}`);
  const rows = await r.json();
  return rows[0];
}

export async function sbPatch(table: string, query: string, patch: object) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: "PATCH",
    headers: sbHeaders({ Prefer: "return=minimal" }),
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error(`supabase patch ${table}: ${r.status}`);
}

export async function sbDelete(table: string, query: string) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: "DELETE",
    headers: sbHeaders({ Prefer: "return=minimal" }),
  });
  if (!r.ok) throw new Error(`supabase delete ${table}: ${r.status}`);
}

// ── Trakt: Profil prüfen (nur öffentliche Endpoints) ─────────────

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

// ── WeTrakr: Device-Code-Flow (inoffiziell, aus dem Kodi-Addon) ──

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
    /* leerer Body */
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
