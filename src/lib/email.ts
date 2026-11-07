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

function angkaDariTeks(teks: string): number | null {
  return angkaDari(/(\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,]\d{2})?/.exec(teks));
}

/** Mengambil nilai setelah label pada baris yang sama, mis. "Nama Merchant : Trijaya". */
function ambilBaris(polos: string, label: string): string | null {
  const pola = new RegExp(`^\\s*${label}\\b\\s*:?\\s*(.+?)\\s*$`, "im");
  const m = pola.exec(polos);
  const nilai = m?.[1]?.replace(/\s+/g, " ").trim();
  return nilai ? nilai.slice(0, 120) : null;
}

function nominalBaris(polos: string, label: string): number | null {
  const nilai = ambilBaris(polos, label);
  return nilai ? angkaDariTeks(nilai) : null;
}

function pertamaNominal(polos: string, label: string[]): number | null {
  for (const l of label) {
    const nilai = nominalBaris(polos, l);
    if (nilai) return nilai;
  }
  return null;
}

function pertamaTeks(polos: string, label: string[]): string | null {
  for (const l of label) {
    const nilai = ambilBaris(polos, l);
    if (nilai) return nilai;
  }
  return null;
}

export interface DetailEmail {
  [kunci: string]: string | number | null;
  merchant: string | null;
  lokasi: string | null;
  kontak: string | null;
  konsumen: string | null;
  kasir: string | null;
  jenisTransaksi: string | null;
  rrn: string | null;
  terminal: string | null;
  noTransaksi: string | null;
  referensi: string | null;
  nominal: number | null;
  biayaAdmin: number | null;
  total: number | null;
  pajak: number | null;
  dibayar: number | null;
  kembalian: number | null;
}

const LABEL_TOTAL = ["Total Pembayaran", "Total Biaya", "Total"];
const LABEL_NOMINAL = ["Nominal Transaksi", "Nominal", "Jumlah", "Amount"];
const LABEL_ADMIN = ["Biaya Admin", "Biaya Transfer", "Biaya Lainnya", "Biaya Tambahan", "Admin"];

/**
 * Membaca detail notifikasi transaksi (khususnya BSI/QRIS).
 * `total` diutamakan dari baris "Total"; bila tidak ada, nominal ditambah biaya admin/transfer.
 */
export function ekstrakDetailEmail(teks: string): DetailEmail {
  const polos = teksPolos(teks);
  const nominal = pertamaNominal(polos, LABEL_NOMINAL);
  const biayaAdmin = pertamaNominal(polos, LABEL_ADMIN);
  const total = pertamaNominal(polos, LABEL_TOTAL) ?? (nominal ? nominal + (biayaAdmin ?? 0) : null);

  return {
    merchant: pertamaTeks(polos, ["Nama Merchant", "Merchant"]),
    lokasi: pertamaTeks(polos, ["Lokasi Merchant", "Lokasi"]),
    kontak: pertamaTeks(polos, ["Kontak", "No. HP", "Telepon"]),
    konsumen: pertamaTeks(polos, ["Nama Konsumen", "Konsumen", "Pelanggan"]),
    kasir: pertamaTeks(polos, ["Kasir", "Nama Kasir"]),
    jenisTransaksi: pertamaTeks(polos, ["Jenis Transaksi"]),
    rrn: pertamaTeks(polos, ["RRN"]),
    terminal: pertamaTeks(polos, ["Terminal", "ID Terminal"]),
    noTransaksi: pertamaTeks(polos, ["No. Transaksi", "Nomor Transaksi", "No Transaksi"]),
    referensi: pertamaTeks(polos, ["Referensi", "No. Referensi", "Nomor Referensi"]),
    nominal,
    biayaAdmin,
    total,
    pajak: pertamaNominal(polos, ["Pajak", "PPN", "Tax"]),
    dibayar: pertamaNominal(polos, ["Dibayar", "Jumlah Dibayar", "Tunai"]),
    kembalian: pertamaNominal(polos, ["Kembalian", "Kembali"]),
  };
}

/**
 * Mengambil nominal TOTAL rupiah dari teks notifikasi bank/email.
 * Bila ada biaya admin/transfer, nilainya ikut ditambahkan kecuali baris "Total" sudah tersedia.
 * Mendukung format Indonesia (`Rp 25.925,00`) dan tabel Inggris (`1,800,000.00`).
 */
export function ekstrakNominalEmail(teks: string): number | null {
  const detail = ekstrakDetailEmail(teks);
  if (detail.total) return detail.total;

  const bersih = teksPolos(teks).replace(/\n/g, " ").replace(/\s+/g, " ");

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
