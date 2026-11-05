/**
 * Parser ringkas untuk email masuk (mis. notifikasi transaksi BSI yang diteruskan
 * via webhook penyedia email). Tidak mengasumsikan format bank tertentu secara ketat;
 * kirim field `nominal`/`tanggal` langsung dari penyedia bila memungkinkan.
 */

const KATA_GAJI = /\b(gaji|payroll|salary|upah|thr)\b/i;
const KATA_MASUK = /\b(incoming|dana masuk|transfer masuk|pemasukan|kredit|credited|payroll|gaji|salary|upah|thr)\b/i;
const KATA_KELUAR = /\b(qris|pembayaran|payment|debit|pengeluaran|transfer keluar|outgoing)\b/i;

export type ArahEmail = "gaji" | "masuk" | "keluar";

/** Mengubah teks email/HTML menjadi teks polos dengan baris yang bisa diandalkan. */
function teksPolos(teks: string): string {
  return teks
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|tr|td|th|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function angkaDari(cocok: RegExpExecArray | null): number | null {
  if (!cocok) return null;
  const angka = Number(cocok[1].replace(/[.,]/g, ""));
  return Number.isFinite(angka) && angka > 0 ? angka : null;
}

/**
 * Mengambil nominal rupiah dari teks notifikasi bank/email.
 * Mendukung format Indonesia (`Rp 25.925,00`) dan tabel Inggris (`1,800,000.00`).
 */
export function ekstrakNominalEmail(teks: string): number | null {
  const bersih = teksPolos(teks).replace(/\n/g, " ").replace(/\s+/g, " ");

  // Label paling spesifik lebih dulu: "Nominal Transaksi", "Nominal", "Total".
  const label = /\b(?:Nominal(?:\s+Transaksi)?|Total|Jumlah)\b[^\d]{0,40}(\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,]\d{2})?/i.exec(bersih);
  const hasilLabel = angkaDari(label);
  if (hasilLabel) return hasilLabel;

  // Diutamakan angka yang didahului "Rp" (format umum notifikasi bank).
  const dekatRp = /\bRp\.?\s*(\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,]\d{2})?/i.exec(bersih);
  const hasilRp = angkaDari(dekatRp);
  if (hasilRp) return hasilRp;

  return angkaDari(/(\d{1,3}(?:[.,]\d{3})+)(?:[.,]\d{2})?/.exec(bersih));
}

/** Heuristik: email ini kemungkinan notifikasi gaji/payroll, bukan transfer biasa. */
export function kemungkinanGaji(subjek: string, teks: string): boolean {
  const gabung = `${subjek}\n${teks}`;
  return KATA_GAJI.test(gabung);
}

/** Menentukan arah transaksi dari subjek/isi email. `null` = tidak dikenali. */
export function arahEmail(subjek: string, teks: string): ArahEmail | null {
  const gabung = `${subjek}\n${teks}`;
  if (KATA_GAJI.test(gabung)) return "gaji";
  if (KATA_MASUK.test(gabung)) return "masuk";
  if (KATA_KELUAR.test(gabung)) return "keluar";
  return null;
}

function ambilLabel(teks: string, label: string): string | null {
  const pola = new RegExp(
    `\\b${label}\\b\\s*:?\\s*([^\\n]{1,80}?)(?=\\s*(?:\\n|Lokasi Merchant|RRN|Terminal|No\\. Transaksi|Referensi|$))`,
    "i",
  );
  const m = pola.exec(teks);
  const nilai = m?.[1]?.replace(/\s+/g, " ").trim();
  return nilai ? nilai.slice(0, 120) : null;
}

/** Label transaksi: nama merchant untuk pengeluaran, subjek untuk email lain. */
export function labelEmail(subjek: string, teks: string, arah: ArahEmail): string | null {
  if (arah === "keluar") {
    const polos = teksPolos(teks);
    return ambilLabel(polos, "Nama Merchant") ?? ambilLabel(polos, "Merchant") ?? ambilLabel(polos, "Jenis Transaksi");
  }
  return (subjek.trim() || null)?.slice(0, 120) ?? null;
}

const BULAN: Record<string, number> = {
  jan: 1, januari: 1,
  feb: 2, februari: 2, peb: 2, pebruari: 2,
  mar: 3, maret: 3,
  apr: 4, april: 4,
  mei: 5, may: 5,
  jun: 6, juni: 6,
  jul: 7, juli: 7,
  agu: 8, agt: 8, agustus: 8, aug: 8,
  sep: 9, september: 9,
  okt: 10, oktober: 10, oct: 10,
  nov: 11, november: 11,
  des: 12, desember: 12, dec: 12,
};

function tanggalSah(tahun: number, bulan: number, hari: number, hariIni: string): string | null {
  if (bulan < 1 || bulan > 12) return null;
  const iso = `${tahun}-${String(bulan).padStart(2, "0")}-${String(hari).padStart(2, "0")}`;
  const t = new Date(Date.UTC(tahun, bulan - 1, hari));
  if (t.getUTCFullYear() !== tahun || t.getUTCMonth() !== bulan - 1 || t.getUTCDate() !== hari) return null;
  return iso <= hariIni ? iso : null;
}

/** Mengambil tanggal transaksi dari isi email. `null` = pakai tanggal hari ini. */
export function ekstrakTanggalEmail(teks: string, hariIni: string): string | null {
  const polos = teksPolos(teks);

  // 31-OKT-26 / 31 Oktober 2026 / 5 November 2026
  let m = /\b(\d{1,2})[-/ ]([A-Za-z]{3,9})[-/ ](\d{2,4})\b/.exec(polos);
  if (m) {
    const bulan = BULAN[m[2].toLowerCase()];
    const tahun = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    if (bulan) {
      const iso = tanggalSah(tahun, bulan, Number(m[1]), hariIni);
      if (iso) return iso;
    }
  }

  // 05/11/2026 atau 05-11-2026
  m = /\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/.exec(polos);
  if (m) {
    const iso = tanggalSah(Number(m[3]), Number(m[2]), Number(m[1]), hariIni);
    if (iso) return iso;
  }

  return null;
}
