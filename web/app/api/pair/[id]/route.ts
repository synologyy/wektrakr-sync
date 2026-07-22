import { NextResponse } from "next/server";
import {
  deletePairing,
  getPairing,
  insertConnection,
  wetrakrPollToken,
} from "@/lib/server";

export const runtime = "nodejs";

const UUID = /^[0-9a-f-]{36}$/;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID.test(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const pairing = await getPairing(id);
  if (!pairing) {
    return NextResponse.json({ status: "expired" });
  }
  if (new Date(pairing.expires_at).getTime() < Date.now()) {
    await deletePairing(id);
    return NextResponse.json({ status: "expired" });
  }

  const poll = await wetrakrPollToken(pairing.device_code);

  if (poll.status === "pending") {
    return NextResponse.json({ status: "pending" });
  }
  if (poll.status === "expired") {
    await deletePairing(id);
    return NextResponse.json({ status: "expired" });
  }

  const conn = await insertConnection({
    trakt_username: pairing.trakt_username,
    wetrakr_token: poll.access_token,
    wetrakr_username: poll.username ?? null,
    live_enabled: pairing.live_enabled,
  });
  await deletePairing(id);

  const base = process.env.APP_URL?.replace(/\/+$/, "");
  return NextResponse.json({
    status: "connected",
    wetrakr_username: poll.username ?? null,
    manage_token: conn.manage_token,
    manage_url: base ? `${base}/manage/${conn.manage_token}` : null,
  });
}
