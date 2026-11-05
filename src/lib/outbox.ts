import { getPool } from "./pg-repo";
import { kirimBalasan } from "./whatsapp";

const BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 6 * 60 * 60_000];
const LEASE_MS = 2 * 60_000;
const MAKS_PERCOBAAN = BACKOFF_MS.length;

export function jedaUlang(percobaan: number): number {
  return BACKOFF_MS[Math.max(0, Math.min(BACKOFF_MS.length - 1, percobaan - 1))];
}

async function klaim(id: number): Promise<boolean> {
  const r = await getPool().query(
    `UPDATE outbox
     SET status = 'mengirim', percobaan = percobaan + 1,
         berikutnya_pada = now() + ($2::int * interval '1 millisecond')
     WHERE id = $1 AND status = 'menunggu'
     RETURNING id`,
    [id, LEASE_MS],
  );
  return (r.rowCount ?? 0) > 0;
}

async function tandaiTerkirim(id: number): Promise<void> {
  await getPool().query(
    `UPDATE outbox SET status = 'terkirim', terkirim_pada = now(), error = NULL WHERE id = $1`,
    [id],
  );
}

async function tandaiGagal(id: number, percobaan: number, error: string): Promise<void> {
  const permanen = percobaan >= MAKS_PERCOBAAN;
  await getPool().query(
    `UPDATE outbox
     SET status = $2, berikutnya_pada = CASE WHEN $2 = 'menunggu'
       THEN now() + ($3::int * interval '1 millisecond') ELSE berikutnya_pada END,
       error = $4
     WHERE id = $1`,
    [id, permanen ? "gagal" : "menunggu", jedaUlang(percobaan), error.replace(/\b\d{8,15}\b/g, "[redacted]").slice(0, 500)],
  );
}

export async function kirimOutbox(id: number): Promise<boolean> {
  if (!(await klaim(id))) return false;
  const p = await getPool().query("SELECT wa_number, pesan, percobaan FROM outbox WHERE id = $1", [id]);
  const row = p.rows[0] as { wa_number: string; pesan: string; percobaan: number } | undefined;
  if (!row) return false;
  try {
    await kirimBalasan(row.wa_number, row.pesan);
    await tandaiTerkirim(id);
    return true;
  } catch (e) {
    await tandaiGagal(id, Number(row.percobaan), e instanceof Error ? e.message : "Gagal mengirim WhatsApp.");
    return false;
  }
}

export async function prosesAntreanOutbox(batas = 20): Promise<{ diproses: number; terkirim: number; gagal: number }> {
  const pool = getPool();
  await pool.query("DELETE FROM outbox WHERE status IN ('terkirim','gagal') AND dibuat_pada < now() - interval '30 days'");
  await pool.query("DELETE FROM audit_events WHERE dibuat_pada < now() - interval '180 days'");
  const client = await pool.connect();
  let rows: { id: string; wa_number: string; pesan: string; percobaan: number }[] = [];
  try {
    await client.query("BEGIN");
    const ambil = await client.query(
      `SELECT id, wa_number, pesan, percobaan
       FROM outbox
       WHERE (status = 'menunggu' OR (status = 'mengirim' AND berikutnya_pada <= now()))
         AND berikutnya_pada <= now()
       ORDER BY id
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [Math.max(1, Math.min(100, batas))],
    );
    rows = ambil.rows;
    if (rows.length) {
      const ids = rows.map((r) => r.id);
      await client.query(
        `UPDATE outbox SET status = 'mengirim', percobaan = percobaan + 1,
          berikutnya_pada = now() + ($2::int * interval '1 millisecond') WHERE id = ANY($1::bigint[])`,
        [ids, LEASE_MS],
      );
      rows = rows.map((r) => ({ ...r, percobaan: Number(r.percobaan) + 1 }));
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }

  let terkirim = 0;
  let gagal = 0;
  for (const row of rows) {
    try {
      await kirimBalasan(row.wa_number, row.pesan);
      await tandaiTerkirim(Number(row.id));
      terkirim += 1;
    } catch (e) {
      await tandaiGagal(Number(row.id), row.percobaan, e instanceof Error ? e.message : "Gagal mengirim WhatsApp.");
      gagal += 1;
    }
  }
  return { diproses: rows.length, terkirim, gagal };
}
