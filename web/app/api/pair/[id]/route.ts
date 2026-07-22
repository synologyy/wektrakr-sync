import { NextResponse } from "next/server";
import {
  sbDelete,
  sbInsert,
  sbSelect,
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

  const rows = await sbSelect<{
    id: string;
    trakt_username: string;
    live_enabled: boolean;
    device_code: string;
    expires_at: string;
  }>("pairings", `id=eq.${id}&select=*`);

  const pairing = rows[0];
  if (!pairing) {
    return NextResponse.json({ status: "expired" });
  }
  if (new Date(pairing.expires_at).getTime() < Date.now()) {
    await sbDelete("pairings", `id=eq.${id}`);
    return NextResponse.json({ status: "expired" });
  }

  const poll = await wetrakrPollToken(pairing.device_code);

  if (poll.status === "pending") {
    return NextResponse.json({ status: "pending" });
  }
  if (poll.status === "expired") {
    await sbDelete("pairings", `id=eq.${id}`);
    return NextResponse.json({ status: "expired" });
  }

  const conn = await sbInsert<{ manage_token: string }>("connections", {
    trakt_username: pairing.trakt_username,
    wetrakr_token: poll.access_token,
    wetrakr_username: poll.username ?? null,
    live_enabled: pairing.live_enabled,
  });
  await sbDelete("pairings", `id=eq.${id}`);

  const base = process.env.APP_URL?.replace(/\/+$/, "");
  return NextResponse.json({
    status: "connected",
    wetrakr_username: poll.username ?? null,
    manage_token: conn.manage_token,
    manage_url: base ? `${base}/manage/${conn.manage_token}` : null,
  });
}
