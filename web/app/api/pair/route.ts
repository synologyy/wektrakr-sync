import { NextResponse } from "next/server";
import { checkTraktProfile, insertPairing, wetrakrDeviceCode } from "@/lib/server";

export const runtime = "nodejs";

const SLUG = /^[a-zA-Z0-9_.-]{1,64}$/;

export async function POST(req: Request) {
  let body: { trakt_username?: string; live?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const username = (body.trakt_username ?? "").trim();
  if (!SLUG.test(username)) {
    return NextResponse.json({ error: "invalid_username" }, { status: 400 });
  }

  const profile = await checkTraktProfile(username);
  if (profile !== "ok") {
    return NextResponse.json({ error: profile }, { status: 422 });
  }

  const code = await wetrakrDeviceCode();

  const pairing = await insertPairing({
    trakt_username: username,
    live_enabled: Boolean(body.live),
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
