import { NextResponse } from "next/server";
import {
  deleteConnection,
  getConnectionByManageToken,
  setConnectionLive,
} from "@/lib/server";

export const runtime = "nodejs";

const TOKEN = /^[0-9a-f]{48}$/;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!TOKEN.test(token)) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }
  const conn = await getConnectionByManageToken(token);
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
  await setConnectionLive(token, body.live_enabled);
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
  await deleteConnection(token);
  return NextResponse.json({ ok: true });
}
