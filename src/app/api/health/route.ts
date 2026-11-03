import { NextRequest } from "next/server";
import { getPool } from "@/lib/pg-repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WA_VARS = ["WA_PHONE_NUMBER_ID", "WA_ACCESS_TOKEN", "WA_APP_SECRET", "WA_VERIFY_TOKEN"] as const;
const SEMUA_VARS = ["DATABASE_URL", ...WA_VARS, "WA_API_VERSION", "ALLOWED_NUMBERS", "APP_BASE_URL", "GROQ_API_KEY"] as const;

const TABEL = [
  "allowed_numbers",
  "groups",
  "sub_posts",
  "aliases",
  "plan_versions",
  "plan_items",
  "transactions",
  "pending_actions",
  "inbound_messages",
  "config",
] as const;

function hostDari(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/** Jangan pernah mengembalikan connection string utuh walau pesan error pustaka memuatnya. */
function samarkanPesan(pesan: string): string {
  return pesan.replace(/postgres(ql)?:\/\/[^\s"']+/gi, "[redacted]").slice(0, 240);
}

export async function GET(req: NextRequest) {
  const kunci = process.env.HEALTH_TOKEN;
  if (kunci && req.nextUrl.searchParams.get("token") !== kunci) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const env = Object.fromEntries(SEMUA_VARS.map((k) => [k, Boolean(process.env[k]?.trim())]));
  const waSiap = WA_VARS.every((k) => env[k]);
  const host = hostDari(process.env.DATABASE_URL);
  const peringatan: string[] = [];

  if (!env.DATABASE_URL) peringatan.push("DATABASE_URL belum diisi; webhook akan gagal 500.");
  else if (!host) peringatan.push("DATABASE_URL tidak bisa dibaca sebagai URL yang valid.");
  else if (!host.includes("-pooler")) peringatan.push("DATABASE_URL bukan host pooled (-pooler); bisa cepat kehabisan koneksi di Vercel.");
  for (const k of WA_VARS) if (!env[k]) peringatan.push(`${k} belum diisi.`);
  if (!env.ALLOWED_NUMBERS) peringatan.push("ALLOWED_NUMBERS kosong (hanya dipakai saat db:setup).");
  if (!env.APP_BASE_URL) peringatan.push("APP_BASE_URL kosong; perintah ekspor tidak bisa membuat tautan.");

  const db: Record<string, unknown> = {
    tersambung: false,
    skemaSiap: false,
    tabelHilang: [...TABEL],
    jumlah: null,
    error: null,
  };

  if (env.DATABASE_URL) {
    try {
      const pool = getPool();
      const cek = await pool.query(
        `SELECT ${TABEL.map((t) => `to_regclass('public.${t}') IS NOT NULL AS ${t}`).join(", ")}`,
      );
      const ada = cek.rows[0] as Record<string, boolean>;
      const hilang = TABEL.filter((t) => !ada[t]);

      db.tersambung = true;
      db.tabelHilang = hilang;
      db.skemaSiap = hilang.length === 0;

      if (db.skemaSiap) {
        const hitung = await pool.query(
          `SELECT
             (SELECT COUNT(*) FROM allowed_numbers WHERE aktif)::int AS nomor_aktif,
             (SELECT COUNT(*) FROM groups)::int AS grup,
             (SELECT COUNT(*) FROM plan_versions)::int AS rencana,
             (SELECT COUNT(*) FROM transactions)::int AS transaksi,
             (SELECT COUNT(*) FROM inbound_messages)::int AS pesan_masuk`,
        );
        db.jumlah = hitung.rows[0];
      }
    } catch (e) {
      db.error = samarkanPesan((e as Error).message);
    }
  }

  const jumlah = db.jumlah as { nomor_aktif?: number } | null;
  if (db.tersambung && db.skemaSiap && (!jumlah || jumlah.nomor_aktif === 0)) {
    peringatan.push("Tabel allowed_numbers kosong; jalankan `npm run db:setup` agar nomor Anda diterima.");
  }

  return Response.json(
    {
      ok: env.DATABASE_URL && waSiap && db.tersambung && db.skemaSiap && (jumlah?.nomor_aktif ?? 0) > 0,
      waktu: new Date().toISOString(),
      env,
      whatsapp: {
        webhookSiap: waSiap,
        apiVersion: process.env.WA_API_VERSION?.trim() || "v25.0 (default)",
        appBaseUrlHost: hostDari(process.env.APP_BASE_URL),
      },
      database: {
        ...db,
        hostPooled: host ? host.includes("-pooler") : null,
      },
      peringatan,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
