import { getPool } from "./pg-repo";
import { wibDate } from "./parse/date";

export type JenisPemakaian = "ai_parse" | "ai_vision" | "ai_insight";

export function kunciPemakaian(jenis: JenisPemakaian, bulan: string): string {
  return `usage:${bulan}:${jenis}`;
}

/** Tambah counter pemakaian bulan berjalan; hanya jumlah, tanpa isi pesan. Gagal diam-diam agar tidak mengganggu fitur. */
export async function catatPemakaian(jenis: JenisPemakaian, sekarangMs = Date.now()): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  const kunci = kunciPemakaian(jenis, wibDate(sekarangMs).slice(0, 7));
  try {
    await getPool().query(
      `INSERT INTO config (user_id, kunci, nilai) VALUES (NULL, $1, '1')
       ON CONFLICT (kunci) WHERE user_id IS NULL
       DO UPDATE SET nilai = (COALESCE(NULLIF(config.nilai, ''), '0')::bigint + 1)::text`,
      [kunci],
    );
  } catch (error) {
    console.error(`Catat pemakaian gagal: ${error instanceof Error ? error.message : "unknown"}`);
  }
}

export interface PemakaianBulan {
  bulan: string;
  ai: Record<JenisPemakaian, number>;
  whatsapp: { masuk: number; keluar: number };
}

const JENIS: JenisPemakaian[] = ["ai_parse", "ai_vision", "ai_insight"];

/** Agregat pemakaian bulan berjalan dari counter AI dan hitungan baris WA; tanpa PII/isi pesan. */
export async function pemakaianBulanIni(sekarangMs = Date.now()): Promise<PemakaianBulan> {
  const bulan = wibDate(sekarangMs).slice(0, 7);
  const pool = getPool();
  const [counter, wa] = await Promise.all([
    pool.query<{ kunci: string; nilai: string }>(
      "SELECT kunci, nilai FROM config WHERE user_id IS NULL AND kunci = ANY($1::text[])",
      [JENIS.map((j) => kunciPemakaian(j, bulan))],
    ),
    pool.query<{ masuk: string; keluar: string }>(
      `SELECT
         (SELECT COUNT(*) FROM inbound_messages
           WHERE diterima_pada AT TIME ZONE 'Asia/Jakarta' >= date_trunc('month', now() AT TIME ZONE 'Asia/Jakarta'))::int AS masuk,
         (SELECT COUNT(*) FROM outbox
           WHERE dibuat_pada AT TIME ZONE 'Asia/Jakarta' >= date_trunc('month', now() AT TIME ZONE 'Asia/Jakarta'))::int AS keluar`,
    ),
  ]);
  const peta = Object.fromEntries(counter.rows.map((r) => [r.kunci, Number(r.nilai) || 0]));
  return {
    bulan,
    ai: Object.fromEntries(JENIS.map((j) => [j, peta[kunciPemakaian(j, bulan)] ?? 0])) as Record<JenisPemakaian, number>,
    whatsapp: { masuk: Number(wa.rows[0]?.masuk ?? 0), keluar: Number(wa.rows[0]?.keluar ?? 0) },
  };
}
