import { NextResponse } from "next/server";
import { AUTH_COOKIE, opsiCookie } from "@/lib/auth";

export function loginBerhasil(token: string) {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, token, opsiCookie());
  return res;
}

export function loginGagal(pesan: string, status: number) {
  return NextResponse.json({ ok: false, error: pesan }, { status });
}

export function logoutBerhasil() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, "", { ...opsiCookie(), maxAge: 0 });
  return res;
}
