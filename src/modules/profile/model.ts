import { hashPassword, verifyPassword } from "@/lib/auth";
import { getPool } from "@/lib/pg-repo";
import type { ProfilAkun } from "@/lib/types";
import { AksiError } from "@/lib/web-actions";

type BarisProfil = {
  email: string;
  nama: string | null;
  avatar: string | null;
  punya_password: boolean;
};

async function bacaProfil(userId: string): Promise<ProfilAkun | null> {
  const hasil = await getPool().query<BarisProfil>(
    "SELECT email, nama, avatar, password_hash IS NOT NULL AS punya_password FROM auth_users WHERE id = $1",
    [userId],
  );
  const row = hasil.rows[0];
  if (!row) return null;
  const identities = await getPool().query<{ provider: string }>(
    "SELECT provider FROM auth_identities WHERE user_id = $1 ORDER BY provider",
    [userId],
  );
  return {
    nama: row.nama,
    email: row.email,
    avatar: row.avatar,
    punyaPassword: row.punya_password,
    providers: identities.rows.map((item) => item.provider),
  };
}

export async function ambilProfil(userId: string): Promise<ProfilAkun | null> {
  return bacaProfil(userId);
}

export async function ubahProfil(
  userId: string,
  patch: { nama?: string; email?: string; avatar?: string | null },
): Promise<ProfilAkun | null> {
  if (patch.email) {
    const bentrok = await getPool().query("SELECT 1 FROM auth_users WHERE email = $1 AND id <> $2", [patch.email, userId]);
    if (bentrok.rowCount) throw new AksiError("Email tersebut sudah dipakai akun lain.");
  }
  await getPool().query(
    `UPDATE auth_users
     SET nama = CASE WHEN $2::boolean THEN $3 ELSE nama END,
         email = CASE WHEN $4::boolean THEN $5 ELSE email END,
         avatar = CASE WHEN $6::boolean THEN $7 ELSE avatar END
     WHERE id = $1`,
    [
      userId,
      patch.nama !== undefined,
      patch.nama ?? null,
      patch.email !== undefined,
      patch.email ?? null,
      patch.avatar !== undefined,
      patch.avatar ?? null,
    ],
  );
  return bacaProfil(userId);
}

export async function gantiPassword(userId: string, passwordLama: string, passwordBaru: string): Promise<boolean> {
  const hasil = await getPool().query<{ password_hash: string | null }>("SELECT password_hash FROM auth_users WHERE id = $1", [userId]);
  const hashLama = hasil.rows[0]?.password_hash;
  if (!hasil.rows[0]) return false;
  if (hashLama && !(await verifyPassword(passwordLama, hashLama))) return false;
  const hashBaru = await hashPassword(passwordBaru);
  await getPool().query("UPDATE auth_users SET password_hash = $2 WHERE id = $1", [userId, hashBaru]);
  return true;
}

export async function hapusAkun(userId: string, email: string, password: string): Promise<boolean> {
  const hasil = await getPool().query<{ email: string; password_hash: string | null }>(
    "SELECT email, password_hash FROM auth_users WHERE id = $1",
    [userId],
  );
  const akun = hasil.rows[0];
  if (!akun || akun.email.toLowerCase() !== email.toLowerCase()) return false;
  if (akun.password_hash && !(await verifyPassword(password, akun.password_hash))) return false;
  await getPool().query("DELETE FROM auth_users WHERE id = $1", [userId]);
  return true;
}
