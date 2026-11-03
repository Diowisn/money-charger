import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

export const AUTH_COOKIE = "mc_auth";
const UMUR_COOKIE = 60 * 60 * 24 * 30;

function rahasia(): string | null {
  const s = process.env.AUTH_SECRET?.trim() || process.env.DASHBOARD_PASSWORD?.trim();
  return s || null;
}

export function authDikonfigurasi(): boolean {
  return Boolean(process.env.DASHBOARD_PASSWORD?.trim());
}

export function buatToken(): string | null {
  const s = rahasia();
  if (!s) return null;
  return createHmac("sha256", s).update("money-charger-web-v1").digest("hex");
}

export function cocokkanPassword(masuk: string): boolean {
  const benar = process.env.DASHBOARD_PASSWORD?.trim();
  if (!benar) return false;
  const a = Buffer.from(createHmac("sha256", "money-charger-pw").update(masuk).digest("hex"), "hex");
  const b = Buffer.from(createHmac("sha256", "money-charger-pw").update(benar).digest("hex"), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

function cocokkanToken(nilai: string | undefined): boolean {
  const t = buatToken();
  if (!t || !nilai) return false;
  const a = Buffer.from(nilai, "utf8");
  const b = Buffer.from(t, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function sesiValid(): Promise<boolean> {
  const c = await cookies();
  return cocokkanToken(c.get(AUTH_COOKIE)?.value);
}

export function sesiValidDariRequest(req: NextRequest): boolean {
  return cocokkanToken(req.cookies.get(AUTH_COOKIE)?.value);
}

export function opsiCookie() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: UMUR_COOKIE,
  };
}

export function tolakJikaBelumLogin(req: NextRequest): Response | null {
  if (!sesiValidDariRequest(req)) {
    return Response.json({ ok: false, error: "Sesi habis. Silakan login ulang." }, { status: 401 });
  }
  return null;
}
