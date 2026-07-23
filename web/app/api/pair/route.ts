import { NextResponse } from "next/server";
import {
  checkTraktProfile,
  insertPairing,
  nuvioSignIn,
  stremioSignIn,
  wetrakrDeviceCode,
} from "@/lib/server";

export const runtime = "nodejs";

const SLUG = /^[a-zA-Z0-9_.-]{1,64}$/;

export async function POST(req: Request) {
  let body: {
    source?: string;
    trakt_username?: string;
    email?: string;
    password?: string;
    profile_index?: number;
    live?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const source =
    body.source === "nuvio"
      ? "nuvio"
      : body.source === "stremio"
      ? "stremio"
      : "trakt";
  const live = Boolean(body.live);

  let trakt_username: string | null = null;
  let nuvio_refresh_token: string | null = null;
  let nuvio_profile_id: number | null = null;
  let stremio_auth_key: string | null = null;

  if (source === "trakt") {
    const username = (body.trakt_username ?? "").trim();
    if (!SLUG.test(username)) {
      return NextResponse.json({ error: "invalid_username" }, { status: 400 });
    }
    const profile = await checkTraktProfile(username);
    if (profile !== "ok") {
      return NextResponse.json({ error: profile }, { status: 422 });
    }
    trakt_username = username;
  } else if (source === "nuvio") {
    const email = (body.email ?? "").trim();
    const password = body.password ?? "";
    const profileIndex = Number(body.profile_index);
    if (!email || !password || !Number.isInteger(profileIndex)) {
      return NextResponse.json({ error: "invalid_login" }, { status: 400 });
    }
    try {
      const t = await nuvioSignIn(email, password);
      nuvio_refresh_token = t.refresh_token;
    } catch {
      return NextResponse.json({ error: "nuvio_login" }, { status: 422 });
    }
    nuvio_profile_id = profileIndex;
  } else {
    const email = (body.email ?? "").trim();
    const password = body.password ?? "";
    if (!email || !password) {
      return NextResponse.json({ error: "invalid_login" }, { status: 400 });
    }
    try {
      const t = await stremioSignIn(email, password);
      stremio_auth_key = t.auth_key;
    } catch {
      return NextResponse.json({ error: "stremio_login" }, { status: 422 });
    }
  }

  const code = await wetrakrDeviceCode();
  const pairing = await insertPairing({
    source,
    trakt_username,
    nuvio_refresh_token,
    nuvio_profile_id,
    stremio_auth_key,
    live_enabled: source === "nuvio" ? false : live,
    device_code: code.device_code,
    expires_at: new Date(Date.now() + code.expires_in * 1000).toISOString(),
  });

  return NextResponse.json({
    pairing_id: pairing.id,
    user_code: code.user_code,
    verification_url: code.verification_url,
    expires_in: code.expires_in,
    interval: code.interval,
  });
}
