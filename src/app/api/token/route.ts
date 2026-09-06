import { AccessToken } from "livekit-server-sdk";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const room = req.nextUrl.searchParams.get("room")?.trim().toUpperCase();
  const name = req.nextUrl.searchParams.get("name")?.trim();
  if (!room || !name) {
    return NextResponse.json({ error: "room and name required" }, { status: 400 });
  }
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!apiKey || !apiSecret) {
    return NextResponse.json({ error: "server missing LiveKit keys" }, { status: 500 });
  }

  const at = new AccessToken(apiKey, apiSecret, {
    identity: `${name}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    ttl: "6h",
  });
  at.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true });

  return NextResponse.json({ token: await at.toJwt() });
}
