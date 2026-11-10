import { randomBytes } from "node:crypto";
import { createSession, hashPassword, hashToken, verifyPassword } from "@/lib/auth";
import { getPool, PgRepo } from "@/lib/pg-repo";
import { verifikasiTotp } from "@/lib/totp";

export async function jumlahPengguna(): Promise<number> {
  const r = await getPool().query("SELECT COUNT(*)::int AS n FROM auth_users");
  return r.rows[0].n;
}

export async function daftar(
  email: string,
  password: string,
  profil: { nama?: string | null; telepon?: string | null; tanggalLahir?: string | null } = {},
): Promise<string | null> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(72418302)");
    const existing = await client.query("SELECT 1 FROM auth_users WHERE email = $1", [email]);
    if (existing.rowCount) { await client.query("ROLLBACK"); return null; }
    const count = await client.query("SELECT COUNT(*)::int AS n FROM auth_users");
    const firstUser = count.rows[0].n === 0;
    if (!firstUser) { await client.query("ROLLBACK"); return null; }
    const hash = await hashPassword(password);
    const user = await client.query<{ id: string }>(
      "INSERT INTO auth_users (email,password_hash,nama,telepon,tanggal_lahir) VALUES ($1,$2,$3,$4,$5::date) RETURNING id",
      [email, hash, profil.nama ?? null, profil.telepon ?? null, profil.tanggalLahir ?? null],
    );
    const userId = user.rows[0].id;
    if (firstUser) {
      for (const table of ["groups", "sub_posts", "aliases", "plan_versions", "plan_items", "transactions", "debts", "saving_goals", "config"]) {
        await client.query(`UPDATE ${table} SET user_id = $1 WHERE user_id IS NULL`, [userId]);
      }
    } else {
      await new PgRepo(client, true, userId).seed([]);
    }
    const token = randomBytes(32).toString("base64url");
    await client.query("INSERT INTO auth_sessions (token_hash,user_id,expires_at) VALUES ($1,$2,now()+interval '30 days')", [hashToken(token), userId]);
    await client.query("COMMIT");
    return token;
  } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
}

export type HasilMasuk =
  | { status: "ok"; token: string }
  | { status: "2fa" }
  | { status: "gagal" };

export async function masuk(email: string, password: string, kode2fa = ""): Promise<HasilMasuk> {
  const r = await getPool().query<{ id: string; password_hash: string | null; totp_secret: string | null; totp_aktif: boolean }>(
    "SELECT id, password_hash, totp_secret, totp_aktif FROM auth_users WHERE email=$1",
    [email],
  );
  const akun = r.rows[0];
  if (!akun?.password_hash || !(await verifyPassword(password, akun.password_hash))) return { status: "gagal" };
  if (akun.totp_aktif) {
    if (!akun.totp_secret) return { status: "gagal" };
    if (!kode2fa) return { status: "2fa" };
    if (!verifikasiTotp(akun.totp_secret, kode2fa)) return { status: "gagal" };
  }
  return { status: "ok", token: await createSession(akun.id) };
}

export async function cabutSemuaSesi(userId: string): Promise<void> {
  await getPool().query("DELETE FROM auth_sessions WHERE user_id = $1", [userId]);
}

export async function daftarSesi(userId: string, tokenSekarang: string) {
  const hasil = await getPool().query<{ token_hash: string; created_at: string; expires_at: string }>(
    "SELECT token_hash, created_at, expires_at FROM auth_sessions WHERE user_id = $1 AND expires_at > now() ORDER BY created_at DESC",
    [userId],
  );
  return hasil.rows.map((row) => ({
    id: row.token_hash === tokenSekarang ? null : row.token_hash,
    dibuat: row.created_at,
    kedaluwarsa: row.expires_at,
    sekarang: row.token_hash === tokenSekarang,
  }));
}

export async function cabutSesi(userId: string, tokenHash: string): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/.test(tokenHash)) return false;
  const hasil = await getPool().query("DELETE FROM auth_sessions WHERE user_id = $1 AND token_hash = $2", [userId, tokenHash]);
  return (hasil.rowCount ?? 0) > 0;
}

export async function buatTokenReset(email: string): Promise<{ token: string; telepon: string | null } | null> {
  const cari = await getPool().query<{ id: string; telepon: string | null }>(
    "SELECT id, telepon FROM auth_users WHERE lower(email) = lower($1)",
    [email],
  );
  const akun = cari.rows[0];
  if (!akun) return null;
  const token = randomBytes(32).toString("base64url");
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL", [akun.id]);
    await client.query(
      "INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '30 minutes')",
      [hashToken(token), akun.id],
    );
    await client.query("COMMIT");
    return { token, telepon: akun.telepon };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function pakaiTokenReset(token: string, password: string): Promise<boolean> {
  const hash = hashToken(token);
  const hashBaru = await hashPassword(password);
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const hasil = await client.query<{ user_id: string }>(
      "SELECT user_id FROM password_reset_tokens WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() FOR UPDATE",
      [hash],
    );
    const userId = hasil.rows[0]?.user_id;
    if (!userId) {
      await client.query("ROLLBACK");
      return false;
    }
    await client.query("UPDATE auth_users SET password_hash = $2 WHERE id = $1", [userId, hashBaru]);
    await client.query("UPDATE password_reset_tokens SET used_at = now() WHERE token_hash = $1", [hash]);
    await client.query("DELETE FROM auth_sessions WHERE user_id = $1", [userId]);
    await client.query("COMMIT");
    return true;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
