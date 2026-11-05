import { getPool } from "./pg-repo";
import type { PesanMasuk } from "./whatsapp";

const BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 6 * 60 * 60_000];
const LEASE_MS = 2 * 60_000;
const MAKS_PERCOBAAN = BACKOFF_MS.length;

export interface JobInbound {
  id: number;
  payload: PesanMasuk;
  percobaan: number;
}

interface Db {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;
}

export function jedaInbound(percobaan: number): number {
  return BACKOFF_MS[Math.max(0, Math.min(BACKOFF_MS.length - 1, percobaan - 1))];
}

export async function antreInbound(pesan: PesanMasuk[], db: Db = getPool()): Promise<number> {
  let jumlah = 0;
  for (const p of pesan) {
    const r = await db.query(
      `INSERT INTO inbound_jobs (wa_message_id, payload) VALUES ($1, $2::jsonb)
       ON CONFLICT (wa_message_id) DO NOTHING`,
      [p.id, JSON.stringify(p)],
    );
    jumlah += r.rowCount ?? 0;
  }
  return jumlah;
}

export async function klaimInbound(batas = 10, db: Db = getPool()): Promise<JobInbound[]> {
  await db.query("DELETE FROM inbound_jobs WHERE status = 'selesai' AND selesai_pada < now() - interval '7 days'");
  await db.query("DELETE FROM inbound_jobs WHERE status = 'gagal' AND dibuat_pada < now() - interval '30 days'");
  const r = await db.query(
    `UPDATE inbound_jobs
     SET status = 'mengirim', percobaan = percobaan + 1,
         berikutnya_pada = now() + ($2::int * interval '1 millisecond')
     WHERE id IN (
       SELECT id FROM inbound_jobs
       WHERE (status = 'menunggu' OR (status = 'mengirim' AND berikutnya_pada <= now()))
         AND berikutnya_pada <= now()
       ORDER BY id
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING id, payload, percobaan`,
    [Math.max(1, Math.min(50, batas)), LEASE_MS],
  );
  return r.rows.map((row) => ({
    id: Number(row.id),
    payload: row.payload as PesanMasuk,
    percobaan: Number(row.percobaan),
  }));
}

export async function selesaikanInbound(
  id: number,
  percobaan: number,
  error?: string,
  db: Db = getPool(),
): Promise<void> {
  if (!error) {
    await db.query(
      "UPDATE inbound_jobs SET status = 'selesai', selesai_pada = now(), error = NULL, payload = '{}'::jsonb WHERE id = $1",
      [id],
    );
    return;
  }
  const permanen = percobaan >= MAKS_PERCOBAAN;
  await db.query(
    `UPDATE inbound_jobs
     SET status = $2, berikutnya_pada = CASE WHEN $2 = 'menunggu'
       THEN now() + ($3::int * interval '1 millisecond') ELSE berikutnya_pada END,
       error = $4
     WHERE id = $1`,
    [
      id,
      permanen ? "gagal" : "menunggu",
      jedaInbound(percobaan),
      error.replace(/\b\d{8,15}\b/g, "[redacted]").slice(0, 500),
    ],
  );
}
