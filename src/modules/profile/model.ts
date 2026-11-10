import { hashPassword, verifyPassword } from "@/lib/auth";
import { getPool } from "@/lib/pg-repo";
import { buatSecret, otpauthUri, verifikasiTotp } from "@/lib/totp";
import type { ProfilAkun } from "@/lib/types";
import { AksiError } from "@/lib/web-actions";

type BarisProfil = {
  email: string;
  nama: string | null;
  telepon: string | null;
  tanggal_lahir: string | null;
  avatar: string | null;
  punya_password: boolean;
  totp_aktif: boolean;
};

async function bacaProfil(userId: string): Promise<ProfilAkun | null> {
  const hasil = await getPool().query<BarisProfil>(
    "SELECT email, nama, telepon, tanggal_lahir, avatar, password_hash IS NOT NULL AS punya_password, totp_aktif FROM auth_users WHERE id = $1",
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
    telepon: row.telepon,
    tanggalLahir: row.tanggal_lahir,
    avatar: row.avatar,
    punyaPassword: row.punya_password,
    duaFaktorAktif: row.totp_aktif,
    providers: identities.rows.map((item) => item.provider),
  };
}

export async function ambilProfil(userId: string): Promise<ProfilAkun | null> {
  return bacaProfil(userId);
}

export async function ubahProfil(
  userId: string,
  patch: { nama?: string; email?: string; telepon?: string | null; tanggalLahir?: string | null; avatar?: string | null },
): Promise<ProfilAkun | null> {
  if (patch.email) {
    const bentrok = await getPool().query("SELECT 1 FROM auth_users WHERE email = $1 AND id <> $2", [patch.email, userId]);
    if (bentrok.rowCount) throw new AksiError("Email tersebut sudah dipakai akun lain.");
  }
  await getPool().query(
    `UPDATE auth_users
     SET nama = CASE WHEN $2::boolean THEN $3 ELSE nama END,
         email = CASE WHEN $4::boolean THEN $5 ELSE email END,
         telepon = CASE WHEN $6::boolean THEN $7 ELSE telepon END,
         tanggal_lahir = CASE WHEN $8::boolean THEN $9::date ELSE tanggal_lahir END,
         avatar = CASE WHEN $10::boolean THEN $11 ELSE avatar END
     WHERE id = $1`,
    [
      userId,
      patch.nama !== undefined,
      patch.nama ?? null,
      patch.email !== undefined,
      patch.email ?? null,
      patch.telepon !== undefined,
      patch.telepon ?? null,
      patch.tanggalLahir !== undefined,
      patch.tanggalLahir ?? null,
      patch.avatar !== undefined,
      patch.avatar ?? null,
    ],
  );
  return bacaProfil(userId);
}

export async function mulai2fa(userId: string, email: string) {
  const status = await getPool().query<{ totp_aktif: boolean }>("SELECT totp_aktif FROM auth_users WHERE id = $1", [userId]);
  if (status.rows[0]?.totp_aktif) throw new AksiError("2FA sudah aktif. Matikan dulu dengan password.");
  const secret = buatSecret();
  await getPool().query("UPDATE auth_users SET totp_secret = $2, totp_aktif = FALSE WHERE id = $1", [userId, secret]);
  return { secret, uri: otpauthUri(email, secret) };
}

export async function aktifkan2fa(userId: string, kode: string): Promise<boolean> {
  const hasil = await getPool().query<{ totp_secret: string | null }>("SELECT totp_secret FROM auth_users WHERE id = $1", [userId]);
  const secret = hasil.rows[0]?.totp_secret;
  if (!secret || !verifikasiTotp(secret, kode)) return false;
  await getPool().query("UPDATE auth_users SET totp_aktif = TRUE WHERE id = $1", [userId]);
  return true;
}

export async function matikan2fa(userId: string, password: string): Promise<boolean> {
  const hasil = await getPool().query<{ password_hash: string | null }>("SELECT password_hash FROM auth_users WHERE id = $1", [userId]);
  const hash = hasil.rows[0]?.password_hash;
  if (!hash || !(await verifyPassword(password, hash))) return false;
  await getPool().query("UPDATE auth_users SET totp_aktif = FALSE, totp_secret = NULL WHERE id = $1", [userId]);
  return true;
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
