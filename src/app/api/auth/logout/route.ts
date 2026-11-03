import { NextResponse } from "next/server";
import { AUTH_COOKIE, opsiCookie } from "@/lib/auth";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, "", { ...opsiCookie(), maxAge: 0 });
  return res;
}
