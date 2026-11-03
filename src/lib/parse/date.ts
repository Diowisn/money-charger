/** Tanggal bisnis memakai WIB (UTC+7) dan disimpan sebagai string 'YYYY-MM-DD'. */

const WIB_MS = 7 * 3600 * 1000;

export function wibDate(epochMs: number): string {
  return new Date(epochMs + WIB_MS).toISOString().slice(0, 10);
}

function utc(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDays(iso: string, n: number): string {
  return new Date(utc(iso) + n * 86_400_000).toISOString().slice(0, 10);
}

/** a - b dalam hari */
export function diffDays(a: string, b: string): number {
  return Math.round((utc(a) - utc(b)) / 86_400_000);
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function validDate(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1) return null;
  const iso = `${y}-${pad(m)}-${pad(d)}`;
  const t = new Date(utc(iso));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? iso : null;
}

export interface DateResult {
  rest: string;
  date: string | null;
  error?: string;
}

const TOLAK_DEPAN = "Tanggal di masa depan ditolak.";
const TOLAK_TIDAK_VALID = "Tanggal tidak valid.";

/**
 * Mencari kata tanggal (SRS 6.3) di teks dan membuangnya dari sisa teks.
 * Mengenali: kemarin, lusa lalu / kemarin lusa, tgl <n>, tgl <dd/mm[/yyyy]>, dd/mm.
 */
export function extractDate(teks: string, today: string): DateResult {
  const low = teks.toLowerCase();
  const [ty, tm, td] = today.split("-").map(Number);
  const hapus = (m: RegExpExecArray) => (teks.slice(0, m.index) + " " + teks.slice(m.index + m[0].length)).replace(/\s+/g, " ").trim();
  const hasil = (rest: string, date: string): DateResult =>
    date > today ? { rest, date: null, error: TOLAK_DEPAN } : { rest, date };

  let m = /\b(?:lusa lalu|kemarin lusa)\b/.exec(low);
  if (m) return hasil(hapus(m), addDays(today, -2));

  m = /\bkemarin\b/.exec(low);
  if (m) return hasil(hapus(m), addDays(today, -1));

  // tgl 17/10, tanggal 17/10/2026, atau 17/10 saja
  m = /(?:\b(?:tgl|tanggal)\.?\s*)?\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(low);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    if (m[3]) {
      const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
      const iso = validDate(y, mo, d);
      return iso ? hasil(hapus(m), iso) : { rest: teks, date: null, error: TOLAK_TIDAK_VALID };
    }
    let iso = validDate(ty, mo, d);
    if (iso && iso > today) iso = validDate(ty - 1, mo, d);
    return iso ? hasil(hapus(m), iso) : { rest: teks, date: null, error: TOLAK_TIDAK_VALID };
  }

  // tgl 20 -> bulan ini, atau bulan sebelumnya bila n lebih besar dari tanggal hari ini
  m = /\b(?:tgl|tanggal)\.?\s*(\d{1,2})\b/.exec(low);
  if (m) {
    const n = Number(m[1]);
    let y = ty;
    let mo = tm;
    if (n > td) {
      mo -= 1;
      if (mo === 0) {
        mo = 12;
        y -= 1;
      }
    }
    const iso = validDate(y, mo, n);
    return iso ? hasil(hapus(m), iso) : { rest: teks, date: null, error: TOLAK_TIDAK_VALID };
  }

  return { rest: teks, date: null };
}
