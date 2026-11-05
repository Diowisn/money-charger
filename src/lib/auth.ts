import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { getPool } from "./pg-repo";

export const AUTH_COOKIE = "mc_auth";
const UMUR_COOKIE = 60 * 60 * 24 * 30;

function rahasia(): string | null {
  const s = process.env.AUTH_SECRET?.trim() || process.env.DASHBOARD_PASSWORD?.trim();
  return s || null;
}

export function authDikonfigurasi(): boolean {
  return Boolean(process.env.DASHBOARD_PASSWORD?.trim());
}

async function epochSesi(): Promise<string | null> {
  if (!process.env.DATABASE_URL) return "0";
  try {
    const r = await getPool().query("SELECT nilai FROM config WHERE kunci = 'session_epoch'");
    return String(r.rows[0]?.nilai ?? "0");
  } catch {
    return null;
  }
}

export function buatToken(epoch: string): string | null {
  const s = rahasia();
  if (!s) return null;
  const tanda = createHmac("sha256", s).update(`money-charger-web-v1:${epoch}`).digest("hex");
  return `${epoch}.${tanda}`;
}

export function cocokkanPassword(masuk: string): boolean {
  const benar = process.env.DASHBOARD_PASSWORD?.trim();
  if (!benar) return false;
  const a = Buffer.from(createHmac("sha256", "money-charger-pw").update(masuk).digest("hex"), "hex");
  const b = Buffer.from(createHmac("sha256", "money-charger-pw").update(benar).digest("hex"), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

async function cocokkanToken(nilai: string | undefined): Promise<boolean> {
  if (!nilai) return false;
  const epoch = await epochSesi();
  if (epoch === null) return false;
  const t = buatToken(epoch);
  if (!t) return false;
  const a = Buffer.from(nilai, "utf8");
  const b = Buffer.from(t, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function buatTokenSesi(): Promise<string | null> {
  const epoch = await epochSesi();
  return epoch === null ? null : buatToken(epoch);
}

export async function sesiValid(): Promise<boolean> {
  const c = await cookies();
  return cocokkanToken(c.get(AUTH_COOKIE)?.value);
}

export async function sesiValidDariRequest(req: NextRequest): Promise<boolean> {
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

export async function tolakJikaBelumLogin(req: NextRequest): Promise<Response | null> {
  if (!(await sesiValidDariRequest(req))) {
    return Response.json({ ok: false, error: "Sesi habis. Silakan login ulang." }, { status: 401 });
  }
  return null;
}
