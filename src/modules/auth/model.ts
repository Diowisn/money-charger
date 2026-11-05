import { randomBytes } from "node:crypto";
import { createSession, hashPassword, hashToken, verifyPassword } from "@/lib/auth";
import { getPool } from "@/lib/pg-repo";

export async function jumlahPengguna(): Promise<number> {
  const r = await getPool().query("SELECT COUNT(*)::int AS n FROM auth_users");
  return r.rows[0].n;
}

export async function daftar(email: string, password: string): Promise<string | null> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(72418302)");
    const count = await client.query("SELECT COUNT(*)::int AS n FROM auth_users");
    if (count.rows[0].n) { await client.query("ROLLBACK"); return null; }
    const hash = await hashPassword(password);
    const user = await client.query<{ id: string }>("INSERT INTO auth_users (email,password_hash) VALUES ($1,$2) RETURNING id", [email, hash]);
    const userId = user.rows[0].id;
    for (const table of ["groups", "sub_posts", "aliases", "plan_versions", "plan_items", "transactions", "debts", "saving_goals", "config"]) {
      await client.query(`UPDATE ${table} SET user_id = $1 WHERE user_id IS NULL`, [userId]);
    }
    const token = randomBytes(32).toString("base64url");
    await client.query("INSERT INTO auth_sessions (token_hash,user_id,expires_at) VALUES ($1,$2,now()+interval '30 days')", [hashToken(token), user.rows[0].id]);
    await client.query("COMMIT");
    return token;
  } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
}

export async function masuk(email: string, password: string): Promise<string | null> {
  const r = await getPool().query("SELECT id,password_hash FROM auth_users WHERE email=$1", [email]);
  if (!r.rows[0]?.password_hash || !(await verifyPassword(password, r.rows[0].password_hash))) return null;
  return createSession(r.rows[0].id);
}

export async function cabutSemuaSesi(): Promise<void> {
  await getPool().query("DELETE FROM auth_sessions");
}
