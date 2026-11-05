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
  console.log("Skema siap.");

  const seeded = await new PgRepo().seed(nomor);
  console.log(seeded ? "Draft 1 dan alias bawaan terisi." : "Data bawaan sudah ada, dilewati.");
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
