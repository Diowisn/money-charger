/**
 * Menyiapkan database Neon: membuat tabel, mengisi Draft 1 + alias, dan whitelist nomor.
 * Jalankan: npm run db:setup  (butuh DATABASE_URL dan ALLOWED_NUMBERS di .env.local)
 * Aman dijalankan ulang; jalankan lagi setelah mengubah ALLOWED_NUMBERS.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { getPool, PgRepo } from "../src/lib/pg-repo";

async function main() {
  const nomor = (process.env.ALLOWED_NUMBERS ?? "")
    .split(",")
    .map((s) => s.replace(/[^0-9]/g, ""))
    .filter(Boolean);
  if (!nomor.length) throw new Error("ALLOWED_NUMBERS kosong. Isi dengan nomor pribadi format 62812...");

  const sql = readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8");
  await getPool().query(sql);
  await getPool().query(
    "INSERT INTO schema_version (version, description) VALUES ($1, $2) ON CONFLICT (version) DO NOTHING",
    [1, "Baseline skema saat ini; tidak merekam riwayat perubahan sebelum versioning diperkenalkan."],
  );
  await getPool().query(
    "INSERT INTO schema_version (version, description) VALUES ($1, $2) ON CONFLICT (version) DO NOTHING",
    [2, "Transaksi berulang otomatis (recurring_rules, recurring_runs)."],
  );
  await getPool().query(
    "INSERT INTO schema_version (version, description) VALUES ($1, $2) ON CONFLICT (version) DO NOTHING",
    [3, "Dompet multi-akun (accounts, transactions.account_id)."],
  );
  await getPool().query(
    "INSERT INTO schema_version (version, description) VALUES ($1, $2) ON CONFLICT (version) DO NOTHING",
    [4, "Kolaborasi keluarga (workspace_members)."],
  );
  await getPool().query(
    "INSERT INTO schema_version (version, description) VALUES ($1, $2) ON CONFLICT (version) DO NOTHING",
    [5, "Nomor WhatsApp anggota keluarga."],
  );
  await getPool().query(
    "INSERT INTO schema_version (version, description) VALUES ($1, $2) ON CONFLICT (version) DO NOTHING",
    [6, "2FA TOTP dan manajemen sesi."],
  );
  await getPool().query(
    "INSERT INTO schema_version (version, description) VALUES ($1, $2) ON CONFLICT (version) DO NOTHING",
    [7, "Koneksi Google Sheets langsung (refresh token terenkripsi)."],
  );
  await getPool().query(
    "INSERT INTO schema_version (version, description) VALUES ($1, $2) ON CONFLICT (version) DO NOTHING",
    [8, "Isolasi transaksi per akun dan rantai hash transaksi."],
  );
  await getPool().query(
    "INSERT INTO schema_version (version, description) VALUES ($1, $2) ON CONFLICT (version) DO NOTHING",
    [9, "Tautan email per akun untuk Apps Script Gmail."],
  );
  await getPool().query(
    "INSERT INTO schema_version (version, description) VALUES ($1, $2) ON CONFLICT (version) DO NOTHING",
    [10, "Tag transaksi (transactions.tags)."],
  );
  await getPool().query(
    "INSERT INTO schema_version (version, description) VALUES ($1, $2) ON CONFLICT (version) DO NOTHING",
    [11, "Kode pemulihan 2FA sekali pakai (auth_recovery_codes)."],
  );
  const users = await getPool().query<{ id: string }>("SELECT id FROM auth_users");
  for (const user of users.rows) {
    await new PgRepo(undefined, undefined, user.id).backfillLedger();
  }
  const email = await getPool().query(
    `INSERT INTO email_links (user_id, email)
     SELECT id, email FROM auth_users
     ON CONFLICT (user_id) DO NOTHING`,
  );
  console.log("Skema siap. Baseline skema v1-v11 tercatat; rantai hash transaksi diisi.");
  console.log(`Email terdaftar: ${email.rowCount ?? 0} akun baru.`);

  const seeded = await new PgRepo().seed(nomor);
  console.log(seeded ? "Draft 1 dan alias bawaan terisi." : "Data bawaan sudah ada, dilewati.");

  await getPool().query(
    `INSERT INTO accounts (user_id, nama, tipe, saldo_awal, urutan)
     SELECT u.id, 'Dompet utama', 'tunai',
            COALESCE((SELECT NULLIF(nilai, '')::bigint FROM config WHERE user_id = u.id AND kunci = 'saldo_awal'), 0),
            1
     FROM auth_users u
     WHERE NOT EXISTS (SELECT 1 FROM accounts a WHERE a.user_id = u.id)
     ON CONFLICT DO NOTHING`,
  );
  const integrasi = [
    ["whatsapp", "cloud-api", process.env.WA_PHONE_NUMBER_ID && process.env.WA_ACCESS_TOKEN ? "aktif" : "nonaktif"],
    ["email", "inbound", process.env.EMAIL_INBOUND_SECRET ? "aktif" : "nonaktif"],
    ["ai", "groq", process.env.GROQ_API_KEY ? "aktif" : "nonaktif"],
  ] as const;
  for (const [jenis, nama, status] of integrasi) {
    await getPool().query(
      `INSERT INTO integrations (jenis, nama, status) VALUES ($1, $2, $3)
       ON CONFLICT (jenis, nama) DO UPDATE SET status = EXCLUDED.status, diperbarui_pada = now()`,
      [jenis, nama, status],
    );
  }
  console.log(`Nomor diizinkan: ${nomor.map((n) => n.slice(0, 4) + "***" + n.slice(-2)).join(", ")}`);
  await getPool().end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
