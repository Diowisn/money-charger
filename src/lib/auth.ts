import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export async function hashPassword(password: string) { const salt = randomBytes(16).toString("hex"); const key = await scrypt(password, salt, 64) as Buffer; return `${salt}:${key.toString("hex")}`; }
export async function verifyPassword(password: string, stored: string) { const [salt, hex] = stored.split(":"); if (!salt || !hex) return false; const actual = await scrypt(password, salt, 64) as Buffer; const expected = Buffer.from(hex, "hex"); return actual.length === expected.length && timingSafeEqual(actual, expected); }
export async function createSession(userId: string) { const token = randomBytes(32).toString("base64url"); await getPool().query("INSERT INTO auth_sessions (token_hash,user_id,expires_at) VALUES ($1,$2,now()+ interval '30 days')", [hashToken(token), userId]); return token; }
async function userForToken(token?: string) { if (!token || !process.env.DATABASE_URL) return null; const r = await getPool().query("SELECT user_id FROM auth_sessions WHERE token_hash=$1 AND expires_at>now()", [hashToken(token)]); return r.rows[0]?.user_id as string | undefined ?? null; }
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { getPool } from "./pg-repo";

export const AUTH_COOKIE = "mc_auth";
const UMUR_COOKIE = 60 * 60 * 24 * 30;

export async function authDikonfigurasi(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  try { return Number((await getPool().query("SELECT COUNT(*)::int AS n FROM auth_users")).rows[0]?.n ?? 0) === 0; }
  catch { return false; }
}

export async function userIdDariRequest(req: NextRequest): Promise<string | null> {
  return userForToken(req.cookies.get(AUTH_COOKIE)?.value);
}

export async function sesiValid(): Promise<boolean> {
  const c = await cookies();
  return Boolean(await userForToken(c.get(AUTH_COOKIE)?.value));
}

export async function userIdDariSesi(): Promise<string | null> {
  const c = await cookies();
  return userForToken(c.get(AUTH_COOKIE)?.value);
}

export async function sesiValidDariRequest(req: NextRequest): Promise<boolean> {
  return Boolean(await userIdDariRequest(req));
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

export type PeranWorkspace = "owner" | "admin" | "member" | "viewer";

/**
 * Validasi sesi sekali saja. Setiap akun selalu memakai datanya sendiri;
 * keanggotaan workspace tidak memberi akses ke transaksi akun lain.
 */
export async function pemilikRequest(req: NextRequest): Promise<{ userId: string; actorId: string; role: PeranWorkspace } | { tolak: Response }> {
  const actorId = await userIdDariRequest(req);
  if (!actorId) {
    return { tolak: Response.json({ ok: false, error: "Sesi habis. Silakan login ulang." }, { status: 401 }) };
  }
  return { userId: actorId, actorId, role: "owner" };
}

export function tolakPeran(auth: { role: PeranWorkspace }, izin: "tulis" | "kelola"): Response | null {
  if (izin === "kelola" && auth.role !== "owner" && auth.role !== "admin") {
    return Response.json({ ok: false, error: "Hanya pemilik atau admin yang boleh mengubah pengaturan ini." }, { status: 403 });
  }
  if (izin === "tulis" && auth.role === "viewer") {
    return Response.json({ ok: false, error: "Anggota dengan akses lihat tidak boleh mengubah data." }, { status: 403 });
  }
  return null;
}

export function normalisasiNomorWa(nomor: string): string {
  const digit = nomor.replace(/\D/g, "");
  if (!digit) return "";
  if (digit.startsWith("0")) return `62${digit.slice(1)}`;
  if (digit.startsWith("8")) return `62${digit}`;
  return digit;
}
