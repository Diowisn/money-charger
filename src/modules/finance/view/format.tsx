import type { DashboardData, TxView } from "@/lib/dashboard";
import type { Tema } from "./tipe";

export const INTERVAL_LIVE_MS = 5000;

/** Transaksi baru dari email yang belum pernah terlihat oleh sesi dashboard ini. */
export function transaksiEmailBaru(transaksi: TxView[], dikenal: ReadonlySet<number>): TxView[] {
  return transaksi.filter((tx) => !dikenal.has(tx.id) && tx.detail?.sumber === "email");
}

export const NAMA_TIPE: Record<string, string> = {
  out: "Pengeluaran",
  in: "Pemasukan",
  gaji: "Gaji",
  bonus: "Bonus",
  tarik: "Tarik",
  pindah: "Pindah",
  selisih_gaji: "Selisih gaji",
  tambahan_jatah: "Tambahan jatah",
  alokasi_gaji: "Alokasi gaji",
  geser: "Geser jatah",
};

export const rp = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;
export const rpOpsional = (n: number | null) => (n === null ? "—" : rp(n));

/** Angka mentah -> "1.500.000" untuk input rupiah. */
export function formatAngkaRupiah(nilai: string | number) {
  const digit = String(nilai).replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return digit.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export const LABEL_DETAIL: Record<string, string> = {
  merchant: "Merchant",
  lokasi: "Lokasi",
  kontak: "Kontak",
  konsumen: "Konsumen",
  kasir: "Kasir",
  jenisTransaksi: "Jenis transaksi",
  rrn: "RRN",
  terminal: "Terminal",
  noTransaksi: "No. transaksi",
  referensi: "Referensi",
  nominal: "Nominal",
  biayaAdmin: "Biaya admin",
  total: "Total",
  pajak: "Pajak",
  dibayar: "Dibayar",
  kembalian: "Kembalian",
  toko: "Toko",
  alamat: "Alamat",
  kategori: "Kategori",
};

export const KUNCI_UANG_DETAIL = new Set(["nominal", "biayaAdmin", "total", "pajak", "dibayar", "kembalian"]);

export const BULAN_PENDEK = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

export function tanggalPendek(iso: string) {
  const [tahun, bulan, hari] = iso.split("-").map(Number);
  if (!tahun || !bulan || !hari) return iso;
  return `${hari} ${BULAN_PENDEK[bulan - 1] ?? ""} ${tahun}`;
}

export function formatMarkdown(teks: string) {
  return teks.split(/(\*\*[^*]+\*\*)/g).map((bagian, i) =>
    bagian.startsWith("**") && bagian.endsWith("**") ? <strong key={i}>{bagian.slice(2, -2)}</strong> : bagian,
  );
}

export function labelBulan(kunci: string) {
  const [tahun, bulan] = kunci.split("-").map(Number);
  if (!tahun || !bulan) return kunci;
  return `${BULAN_PENDEK[bulan - 1] ?? ""} ${tahun}`;
}

export function mundurBulan(tahun: number, bulan: number, langkah: number) {
  let y = tahun;
  let m = bulan - langkah;
  while (m <= 0) {
    m += 12;
    y -= 1;
  }
  return `${y}-${String(m).padStart(2, "0")}`;
}

export function drafRencana(data: DashboardData): Record<string, number> {
  const d: Record<string, number> = {
    dd: data.rencanaLain.dd,
    tabungan: data.rencanaLain.tabungan,
    investasi: data.rencanaLain.investasi,
  };
  for (const p of data.posSemua) if (p.aktif) d[`s:${p.id}`] = p.jatahRencana;
  return d;
}

export function temaAwal(): Tema {
  if (typeof window === "undefined") return "terang";
  const simpanan = window.localStorage.getItem("mc_tema");
  if (simpanan === "terang" || simpanan === "gelap") return simpanan;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "gelap" : "terang";
}
