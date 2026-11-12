import { getPool } from "@/lib/pg-repo";
import { pemakaianBulanIni, type PemakaianBulan } from "@/lib/usage";

const WA_VARS = ["WA_PHONE_NUMBER_ID", "WA_ACCESS_TOKEN", "WA_APP_SECRET", "WA_VERIFY_TOKEN"] as const;
const SEMUA_VARS = [
  "DATABASE_URL",
  ...WA_VARS,
  "WA_API_VERSION",
  "ALLOWED_NUMBERS",
  "APP_BASE_URL",
  "GROQ_API_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_TOKEN_ENCRYPTION_KEY",
  "FACEBOOK_APP_ID",
  "FACEBOOK_APP_SECRET",
  "AUTH_CALLBACK_BASE_URL",
  "HEALTH_TOKEN",
  "EMAIL_INBOUND_SECRET",
  "CRON_SECRET",
  "LEDGER_SECRET",
] as const;

const TABEL = [
  "auth_users",
  "auth_sessions",
  "auth_identities",
  "google_sheets",
  "allowed_numbers",
  "workspace_members",
  "groups",
  "sub_posts",
  "aliases",
  "plan_versions",
  "plan_items",
  "transactions",
  "ledger_anchors",
  "email_links",
  "pending_actions",
  "inbound_messages",
  "config",
  "debts",
  "saving_goals",
  "inbound_jobs",
  "outbox",
  "audit_events",
  "integrations",
] as const;

function hostDari(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function samarkanPesan(pesan: string): string {
  return pesan.replace(/postgres(ql)?:\/\/[^\s"']+/gi, "[redacted]").slice(0, 240);
}

const BATAS_CRON_JAM = 26;

/** Pesan peringatan bila cron terakhir lebih dari 26 jam lalu (jadwal harian + toleransi), atau null bila sehat. */
export function cronBasi(terakhir: string | null, sekarangMs: number): string | null {
  if (!terakhir) return "Cron belum pernah tercatat berjalan; transaksi otomatis, digest, dan laporan terjadwal tidak akan jalan.";
  const ms = Date.parse(terakhir);
  if (!Number.isFinite(ms)) return "Nilai cron_terakhir tidak valid.";
  const jam = (sekarangMs - ms) / 3_600_000;
  if (jam > BATAS_CRON_JAM) return `Cron terakhir berjalan ${Math.floor(jam)} jam lalu (> ${BATAS_CRON_JAM} jam); periksa jadwal cron.`;
  return null;
}

export async function periksaKesiapan() {
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
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) peringatan.push("Kredensial Google OAuth belum lengkap; tombol Google tidak tampil.");
  if (!((process.env.FACEBOOK_APP_ID || process.env.META_APP_ID) && (process.env.FACEBOOK_APP_SECRET || process.env.WA_APP_SECRET))) peringatan.push("Kredensial Facebook Login belum lengkap; tombol Facebook tidak tampil.");
  if (!env.HEALTH_TOKEN) peringatan.push("HEALTH_TOKEN kosong; endpoint /api/health hanya menampilkan status ringkas.");
  if (!env.EMAIL_INBOUND_SECRET) peringatan.push("EMAIL_INBOUND_SECRET kosong; webhook email menolak semua permintaan.");
  if (!env.CRON_SECRET) peringatan.push("CRON_SECRET kosong; retry terjadwal outbox belum aktif.");
  if (!env.LEDGER_SECRET) peringatan.push("LEDGER_SECRET kosong; hash transaksi memakai SHA-256 tanpa kunci rahasia.");

  const db: Record<string, unknown> = {
    tersambung: false,
    skemaSiap: false,
    tabelHilang: [...TABEL],
    jumlah: null,
    cronTerakhir: null,
    error: null,
  };

  let pemakaian: PemakaianBulan | null = null;
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
        const cron = await pool.query(
          "SELECT nilai FROM config WHERE user_id IS NULL AND kunci = 'cron_terakhir'",
        );
        db.cronTerakhir = (cron.rows[0]?.nilai as string | undefined) ?? null;
        try {
          pemakaian = await pemakaianBulanIni();
        } catch {
          pemakaian = null;
        }
        const hitung = await pool.query(
          `SELECT
             (SELECT COUNT(*) FROM allowed_numbers WHERE aktif)::int AS nomor_aktif,
             (SELECT COUNT(*) FROM groups)::int AS grup,
             (SELECT COUNT(*) FROM plan_versions)::int AS rencana,
             (SELECT COUNT(*) FROM transactions)::int AS transaksi,
             (SELECT COUNT(*) FROM inbound_messages)::int AS pesan_masuk,
             (SELECT COUNT(*) FROM debts WHERE status = 'aktif')::int AS utang_piutang_aktif,
             (SELECT COUNT(*) FROM saving_goals WHERE status = 'aktif')::int AS target_aktif,
             (SELECT COUNT(*) FROM inbound_jobs WHERE status IN ('menunggu','mengirim'))::int AS inbound_tertunda,
             (SELECT COUNT(*) FROM inbound_jobs WHERE status = 'gagal')::int AS inbound_gagal,
             (SELECT COUNT(*) FROM outbox WHERE status = 'menunggu')::int AS outbox_menunggu,
             (SELECT COUNT(*) FROM outbox WHERE status = 'gagal')::int AS outbox_gagal,
             (SELECT COUNT(*) FROM email_links)::int AS email_terdaftar,
             (SELECT COUNT(*) FROM email_links WHERE linked_at IS NOT NULL OR last_email_at IS NOT NULL)::int AS email_terhubung,
             (SELECT COUNT(*) FROM email_links
               WHERE COALESCE(last_email_at, linked_at) IS NOT NULL
                 AND COALESCE(last_email_at, linked_at) < now() - interval '24 hours')::int AS email_basi,
             (SELECT COUNT(*) FROM audit_events)::int AS audit_events,
             (SELECT COUNT(*) FROM integrations)::int AS integrations`,
        );
        db.jumlah = hitung.rows[0];
      }
    } catch (e) {
      db.error = samarkanPesan((e as Error).message);
    }
  }

  const jumlah = db.jumlah as {
    nomor_aktif?: number;
    outbox_gagal?: number;
    inbound_gagal?: number;
    email_terdaftar?: number;
    email_terhubung?: number;
    email_basi?: number;
  } | null;
  if (db.tersambung && db.skemaSiap && (!jumlah || jumlah.nomor_aktif === 0)) {
    peringatan.push("Tabel allowed_numbers kosong; jalankan `npm run db:setup` agar nomor Anda diterima.");
  }
  if (jumlah?.inbound_gagal) peringatan.push(`${jumlah.inbound_gagal} pesan masuk gagal permanen; perlu diperiksa.`);
  if (jumlah?.outbox_gagal) peringatan.push(`${jumlah.outbox_gagal} balasan WhatsApp gagal permanen; perlu diperiksa.`);
  if (jumlah?.email_basi) {
    peringatan.push(`${jumlah.email_basi} akun tertaut email tidak mengirim transaksi >24 jam; periksa trigger Gmail/Apps Script.`);
  }
  if (db.skemaSiap) {
    const basi = cronBasi(db.cronTerakhir as string | null, Date.now());
    if (basi) peringatan.push(basi);
  }

  return {
    ok: Boolean(env.DATABASE_URL && waSiap && db.tersambung && db.skemaSiap && (jumlah?.nomor_aktif ?? 0) > 0),
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
    pemakaian,
    peringatan,
  };
}

export function tokenHealth(): string | undefined {
  return process.env.HEALTH_TOKEN;
}
