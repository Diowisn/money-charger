import { getPool, PgRepo } from "@/lib/pg-repo";
import { wibDate } from "@/lib/parse/date";
import { tambahTransaksi } from "@/lib/web-actions";
import type { AturanView } from "@/lib/dashboard";
import { AksiError } from "@/lib/web-actions";

interface RuleRow {
  id: number;
  user_id: string | null;
  nama: string;
  nominal: number;
  sub_post_id: number | null;
  sub_nama: string | null;
  hari: number;
  mulai: string;
  aktif: boolean;
  terakhir_jalan: string | null;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function jatuhTempo(rule: { hari: number }, periode: string): string {
  const [tahun, bulan] = periode.split("-").map(Number);
  const maks = new Date(Date.UTC(tahun, bulan, 0)).getUTCDate();
  return `${periode}-${pad(Math.min(rule.hari, maks))}`;
}

function periodeBerikut(periode: string): string {
  const [tahun, bulan] = periode.split("-").map(Number);
  return bulan === 12 ? `${tahun + 1}-01` : `${tahun}-${pad(bulan + 1)}`;
}

export function berikutnyaJatuhTempo(rule: { hari: number; mulai: string }, hariIni: string): string {
  let periode = hariIni.slice(0, 7);
  for (let i = 0; i < 24; i++) {
    const tanggal = jatuhTempo(rule, periode);
    if (tanggal >= hariIni && tanggal >= rule.mulai) return tanggal;
    periode = periodeBerikut(periode);
  }
  return jatuhTempo(rule, periode);
}

function keView(row: RuleRow, hariIni: string): AturanView {
  return {
    id: row.id,
    nama: row.nama,
    nominal: Number(row.nominal),
    hari: Number(row.hari),
    subPostId: row.sub_post_id,
    subPost: row.sub_nama,
    aktif: row.aktif,
    mulai: String(row.mulai),
    terakhirJalan: row.terakhir_jalan ? String(row.terakhir_jalan) : null,
    berikutnya: row.aktif ? berikutnyaJatuhTempo({ hari: Number(row.hari), mulai: String(row.mulai) }, hariIni) : null,
  };
}

export async function daftarAturan(userId: string, hariIni = wibDate(Date.now())): Promise<AturanView[]> {
  try {
    const r = await getPool().query(
      `SELECT rr.*, sp.nama AS sub_nama
       FROM recurring_rules rr
       LEFT JOIN sub_posts sp ON sp.id = rr.sub_post_id
       WHERE rr.user_id = $1
       ORDER BY rr.aktif DESC, rr.hari, rr.id`,
      [userId],
    );
    return (r.rows as RuleRow[]).map((row) => keView(row, hariIni));
  } catch (error) {
    if ((error as { code?: string }).code === "42P01") return [];
    throw error;
  }
}

export async function tambahAturan(userId: string, input: { nama?: unknown; nominal?: unknown; hari?: unknown; subPostId?: unknown; mulai?: unknown }) {
  const nama = typeof input.nama === "string" ? input.nama.trim() : "";
  const nominal = Number(input.nominal);
  const hari = Number(input.hari);
  const mulai = typeof input.mulai === "string" ? input.mulai.trim() : wibDate(Date.now());
  const subPostId = input.subPostId === null || input.subPostId === undefined || input.subPostId === "" ? null : Number(input.subPostId);
  if (!nama || nama.length > 80) throw new AksiError("Nama aturan wajib diisi, maksimal 80 karakter.");
  if (!Number.isInteger(nominal) || nominal <= 0) throw new AksiError("Nominal harus bilangan bulat rupiah lebih dari 0.");
  if (!Number.isInteger(hari) || hari < 1 || hari > 31) throw new AksiError("Tanggal harus 1–31.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(mulai) || Number.isNaN(new Date(`${mulai}T00:00:00Z`).getTime())) throw new AksiError("Tanggal mulai tidak valid.");
  if (subPostId !== null) {
    const pos = await getPool().query("SELECT 1 FROM sub_posts WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)", [subPostId, userId]);
    if (!pos.rowCount) throw new AksiError("Pos tidak ditemukan.");
  }
  const r = await getPool().query(
    `INSERT INTO recurring_rules (user_id, nama, nominal, sub_post_id, hari, mulai)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [userId, nama, nominal, subPostId, hari, mulai],
  );
  return { id: Number(r.rows[0].id) };
}

export async function ubahStatusAturan(userId: string, id: number, aktif: boolean): Promise<void> {
  const r = await getPool().query("UPDATE recurring_rules SET aktif = $3 WHERE id = $1 AND user_id = $2", [id, userId, aktif]);
  if (!r.rowCount) throw new AksiError("Aturan tidak ditemukan.");
}

export async function hapusAturan(userId: string, id: number): Promise<void> {
  const r = await getPool().query("DELETE FROM recurring_rules WHERE id = $1 AND user_id = $2", [id, userId]);
  if (!r.rowCount) throw new AksiError("Aturan tidak ditemukan.");
}

export async function prosesTransaksiBerulang(hariIni = wibDate(Date.now())): Promise<{ diproses: number; dilewati: number; gagal: number }> {
  const pool = getPool();
  const rules = await pool.query<RuleRow>(
    `SELECT rr.*, sp.nama AS sub_nama
     FROM recurring_rules rr
     LEFT JOIN sub_posts sp ON sp.id = rr.sub_post_id
     WHERE rr.aktif AND rr.mulai <= $1
     ORDER BY rr.id`,
    [hariIni],
  );
  let diproses = 0;
  let dilewati = 0;
  let gagal = 0;
  const periode = hariIni.slice(0, 7);

  for (const rule of rules.rows) {
    const due = jatuhTempo({ hari: Number(rule.hari) }, periode);
    if (due > hariIni || String(rule.mulai) > due) {
      dilewati += 1;
      continue;
    }
    const ambil = await pool.query(
      "INSERT INTO recurring_runs (rule_id, periode) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING rule_id",
      [rule.id, periode],
    );
    if (!ambil.rowCount) {
      dilewati += 1;
      continue;
    }
    try {
      const userId = rule.user_id ?? await new PgRepo().firstUserId();
      if (!userId) throw new Error("Pemilik aturan tidak ditemukan.");
      const hasil = await tambahTransaksi(new PgRepo(undefined, undefined, userId), due, {
        tipe: "out",
        nominal: Number(rule.nominal),
        tanggal: due,
        label: rule.nama,
        subPostId: rule.sub_post_id,
      });
      await pool.query(
        "UPDATE recurring_runs SET transaction_id = $3 WHERE rule_id = $1 AND periode = $2",
        [rule.id, periode, hasil.id],
      );
      await pool.query("UPDATE recurring_rules SET terakhir_jalan = $2 WHERE id = $1", [rule.id, due]);
      diproses += 1;
    } catch (error) {
      await pool.query("DELETE FROM recurring_runs WHERE rule_id = $1 AND periode = $2", [rule.id, periode]);
      gagal += 1;
      console.error(`Transaksi berulang gagal (rule ${rule.id}): ${error instanceof Error ? error.message : "unknown"}`);
    }
  }

  return { diproses, dilewati, gagal };
}
