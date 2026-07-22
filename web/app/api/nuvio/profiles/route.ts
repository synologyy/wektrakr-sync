import { NextResponse } from "next/server";
import { nuvioListProfiles, nuvioSignIn } from "@/lib/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const email = (body.email ?? "").trim();
  const password = body.password ?? "";
  if (!email || !password) {
    return NextResponse.json({ error: "invalid_login" }, { status: 400 });
  }
  try {
    const { access_token } = await nuvioSignIn(email, password);
    const profiles = await nuvioListProfiles(access_token);
    return NextResponse.json({ profiles });
  } catch {
    return NextResponse.json({ error: "nuvio_login" }, { status: 422 });
  }
}
