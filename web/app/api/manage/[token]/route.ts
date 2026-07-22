import { NextResponse } from "next/server";
import { sbDelete, sbPatch, sbSelect } from "@/lib/server";

export const runtime = "nodejs";

const TOKEN = /^[0-9a-f]{48}$/;

type Conn = {
  trakt_username: string;
  wetrakr_username: string | null;
  live_enabled: boolean;
  last_watched_at: string | null;
  last_synced_at: string | null;
  last_error: string | null;
  created_at: string;
};

async function getConn(token: string): Promise<Conn | null> {
  const rows = await sbSelect<Conn>(
    "connections",
    `manage_token=eq.${token}&select=trakt_username,wetrakr_username,live_enabled,last_watched_at,last_synced_at,last_error,created_at`
  );
  return rows[0] ?? null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!TOKEN.test(token)) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }
  const conn = await getConn(token);
  if (!conn) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(conn);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!TOKEN.test(token)) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }
  let body: { live_enabled?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.live_enabled !== "boolean") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  await sbPatch("connections", `manage_token=eq.${token}`, {
    live_enabled: body.live_enabled,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!TOKEN.test(token)) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }
  await sbDelete("connections", `manage_token=eq.${token}`);
  return NextResponse.json({ ok: true });
}
