/**
 * Parser nominal terpusat (SRS 6.1, FR-17). Satu-satunya jalur teks -> rupiah,
 * dipakai juga untuk memverifikasi keluaran AI.
 */

export interface AmountOk {
  ok: true;
  value: number;
  /** posisi token nominal di teks asal, untuk dibuang dari uraian */
  start: number;
  end: number;
}
export interface AmountErr {
  ok: false;
  reason: "tidak_ada" | "nol" | "negatif" | "ambigu" | "terlalu_besar";
  pesan: string;
}
export type AmountResult = AmountOk | AmountErr;

export const MAKS_NOMINAL = 1_000_000_000;

const PESAN: Record<AmountErr["reason"], string> = {
  tidak_ada: "Nominal tidak terbaca. Contoh: 25rb, 25.000, 1,8 juta.",
  nol: "Nominal tidak boleh nol.",
  negatif: "Nominal tidak boleh negatif.",
  ambigu: "Nominal ambigu. Tulis seperti 25rb, 25.000, atau 1,8 juta.",
  terlalu_besar: "Nominal di atas Rp1.000.000.000, kemungkinan salah ketik.",
};

const err = (reason: AmountErr["reason"]): AmountErr => ({ ok: false, reason, pesan: PESAN[reason] });

/** Kalikan angka desimal (maks 2 digit pecahan) dengan pengali bulat tanpa float. */
function kali(angka: string, pengali: number): number | null {
  const m = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(angka);
  if (!m) return null;
  const bulat = Number(m[1]);
  const pecah = m[2] ? Number(m[2].padEnd(2, "0")) : 0; // per seratus
  return bulat * pengali + Math.floor((pecah * pengali) / 100);
}

function nilai(angka: string, suffix: string | undefined): number | AmountErr["reason"] {
  const s = suffix?.toLowerCase();
  if (s === "jt" || s === "juta") {
    const v = kali(angka, 1_000_000);
    return v === null ? "ambigu" : v;
  }
  if (s === "rb" || s === "ribu" || s === "k") {
    const v = kali(angka, 1_000);
    return v === null ? "ambigu" : v;
  }
  if (/^\d+$/.test(angka)) return Number(angka);
  if (/^\d{1,3}(\.\d{3})+$/.test(angka)) return Number(angka.replace(/\./g, ""));
  return "ambigu"; // mis. 25,5 atau 1.50 tanpa satuan
}

const POLA = /(\d+(?:[.,]\d+)*)\s?(juta|jt|ribu|rb|k)?(?![a-z0-9])/gi;

/**
 * Mengambil angka pertama yang valid. Angka polos di bawah 1.000 tanpa satuan dianggap
 * "lemah" ("2 gelas kopi 25rb" tidak boleh jadi Rp2); dipakai hanya bila tidak ada kandidat kuat.
 */
export function parseAmount(teks: string, opsi: { izinkanNol?: boolean } = {}): AmountResult {
  let lemah: AmountOk | null = null;
  let galat: AmountErr | null = null;

  for (const m of teks.matchAll(POLA)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    const v = nilai(m[1], m[2]);
    if (typeof v === "string") {
      galat ??= err(v);
      continue;
    }
    if (teks[start - 1] === "-" && (start < 2 || /\s/.test(teks[start - 2]))) {
      galat ??= err("negatif");
      continue;
    }
    if (v === 0) {
      if (opsi.izinkanNol) return { ok: true, value: 0, start, end };
      galat ??= err("nol");
      continue;
    }
    if (v > MAKS_NOMINAL) {
      galat ??= err("terlalu_besar");
      continue;
    }
    const ok: AmountOk = { ok: true, value: v, start, end };
    const kuat = m[2] !== undefined || m[1].includes(".") || v >= 1000;
    if (kuat) return ok;
    lemah ??= ok;
  }
  return lemah ?? galat ?? err("tidak_ada");
}

export function buangSpan(teks: string, start: number, end: number): string {
  return `${teks.slice(0, start)} ${teks.slice(end)}`.replace(/\s+/g, " ").trim();
}
