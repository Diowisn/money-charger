/** Laporan periode kustom dan laporan terjadwal (F-PREM-06). Fungsi murni, tanpa akses DB. */
import { hitungAkun, nominalKeluar } from "./engine";
import { rp, tglPendek } from "./format";
import { addDays, diffDays, kunciMinggu } from "./parse/date";
import { TURUNAN, type JadwalLaporan, type State, type TxTipe, type Wadah } from "./types";
import { AksiError } from "./web-actions";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MAKS_HARI = 366 * 3;
const MASUK = new Set<TxTipe>(["in", "gaji", "bonus"]);

export interface LaporanRingkasan {
  masuk: number;
  keluar: number;
  biayaAdmin: number;
  bersih: number;
  jumlahTransaksi: number;
  rataHarian: number;
}

export interface LaporanKategori {
  nama: string;
  total: number;
  jumlah: number;
  porsi: number;
}

export interface LaporanTipe {
  tipe: TxTipe;
  jumlah: number;
  total: number;
}

export interface LaporanTx {
  id: number;
  tanggal: string;
  tipe: TxTipe;
  nominal: number;
  biayaAdmin: number;
  subPost: string | null;
  label: string | null;
  wadahAsal: Wadah | null;
  wadahTujuan: Wadah | null;
  dompet: string | null;
}

export interface LaporanDompet {
  id: number;
  nama: string;
  saldo: number;
}

export interface LaporanData {
  dari: string;
  sampai: string;
  jumlahHari: number;
  ringkasan: LaporanRingkasan;
  kategori: LaporanKategori[];
  tipe: LaporanTipe[];
  transaksi: LaporanTx[];
  dompet: LaporanDompet[];
  totalDompet: number;
}

export const LABEL_TIPE_LAPORAN: Record<TxTipe, string> = {
  out: "Pengeluaran",
  in: "Pemasukan",
  gaji: "Gaji",
  bonus: "Bonus",
  tarik: "Tarik tabungan",
  pindah: "Pindah wadah",
  alokasi_gaji: "Alokasi gaji",
  selisih_gaji: "Selisih gaji",
  tambahan_jatah: "Tambahan jatah",
  geser: "Geser jatah",
};

function sah(iso: string): boolean {
  if (!ISO.test(iso)) return false;
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** Periode kustom dengan bawaan bulan berjalan; menolak tanggal terbalik, masa depan, dan rentang terlalu panjang. */
export function validasiPeriode(dari: string | null | undefined, sampai: string | null | undefined, hariIni: string): { dari: string; sampai: string } {
  const awalBulan = `${hariIni.slice(0, 7)}-01`;
  const d = dari && sah(dari) ? dari : awalBulan;
  const s = sampai && sah(sampai) ? sampai : hariIni;
  if (d > s) throw new AksiError("Tanggal mulai harus sebelum atau sama dengan tanggal akhir.");
  if (s > hariIni) throw new AksiError("Tanggal akhir tidak boleh di masa depan.");
  if (diffDays(s, d) + 1 > MAKS_HARI) throw new AksiError("Rentang laporan maksimal 3 tahun.");
  return { dari: d, sampai: s };
}

export function bangunLaporan(state: State, dari: string, sampai: string): LaporanData {
  const namaSubPost = (id: number | null) => (id === null ? null : state.subPosts.find((s) => s.id === id)?.nama ?? null);
  const namaDompet = (id: number | null) => (id === null ? null : state.accounts.find((a) => a.id === id)?.nama ?? null);

  const semua = state.txs
    .filter((t) => t.status === "berlaku" && !TURUNAN.has(t.tipe) && t.tanggal >= dari && t.tanggal <= sampai)
    .sort((a, b) => (a.tanggal < b.tanggal ? 1 : a.tanggal > b.tanggal ? -1 : b.id - a.id));

  let masuk = 0;
  let keluar = 0;
  let biayaAdmin = 0;
  const kategori = new Map<string, { total: number; jumlah: number }>();
  const tipe = new Map<TxTipe, { jumlah: number; total: number }>();

  for (const t of semua) {
    const nilai = nominalKeluar(t);
    if (MASUK.has(t.tipe)) masuk += t.nominal;
    if (t.tipe === "out") {
      keluar += nilai;
      biayaAdmin += t.biayaAdmin ?? 0;
      const nama = namaSubPost(t.subPostId) ?? (t.label?.trim() || "(Tanpa pos)");
      const isi = kategori.get(nama) ?? { total: 0, jumlah: 0 };
      isi.total += nilai;
      isi.jumlah += 1;
      kategori.set(nama, isi);
    }
    const isiTipe = tipe.get(t.tipe) ?? { jumlah: 0, total: 0 };
    isiTipe.jumlah += 1;
    isiTipe.total += nilai;
    tipe.set(t.tipe, isiTipe);
  }

  const kategoriUrut = [...kategori.entries()]
    .map(([nama, isi]) => ({ nama, total: isi.total, jumlah: isi.jumlah, porsi: keluar ? isi.total / keluar : 0 }))
    .sort((a, b) => b.total - a.total);

  const akun = hitungAkun(state);
  const jumlahHari = diffDays(sampai, dari) + 1;

  return {
    dari,
    sampai,
    jumlahHari,
    ringkasan: {
      masuk,
      keluar,
      biayaAdmin,
      bersih: masuk - keluar,
      jumlahTransaksi: semua.length,
      rataHarian: Math.round(keluar / jumlahHari),
    },
    kategori: kategoriUrut,
    tipe: [...tipe.entries()]
      .map(([kode, isi]) => ({ tipe: kode, jumlah: isi.jumlah, total: isi.total }))
      .sort((a, b) => b.total - a.total),
    transaksi: semua.map((t) => ({
      id: t.id,
      tanggal: t.tanggal,
      tipe: t.tipe,
      nominal: t.nominal,
      biayaAdmin: t.biayaAdmin ?? 0,
      subPost: namaSubPost(t.subPostId),
      label: t.label,
      wadahAsal: t.wadahAsal,
      wadahTujuan: t.wadahTujuan,
      dompet: namaDompet(t.accountId),
    })),
    dompet: akun.daftar.map((a) => ({ id: a.id, nama: a.nama, saldo: a.saldo })),
    totalDompet: akun.total,
  };
}

/** Teks ringkas untuk WhatsApp/email laporan terjadwal. */
export function teksLaporan(data: LaporanData): string {
  const baris = [
    `Laporan Money-Charger ${tglPendek(data.dari)} - ${tglPendek(data.sampai)}`,
    `Pemasukan: ${rp(data.ringkasan.masuk)}`,
    `Pengeluaran: ${rp(data.ringkasan.keluar)}${data.ringkasan.biayaAdmin ? ` (termasuk biaya admin ${rp(data.ringkasan.biayaAdmin)})` : ""}`,
    `Arus bersih: ${rp(data.ringkasan.bersih)}`,
    `Transaksi: ${data.ringkasan.jumlahTransaksi}`,
  ];
  if (data.kategori.length) {
    baris.push("Pengeluaran terbesar:");
    for (const item of data.kategori.slice(0, 5)) {
      baris.push(`- ${item.nama}: ${rp(item.total)} (${Math.round(item.porsi * 100)}%)`);
    }
  }
  return baris.join("\n");
}

/** Periode lengkap terakhir sebelum hari ini untuk laporan terjadwal mingguan/bulanan. */
export function periodeLaporanTerakhir(jadwal: JadwalLaporan, hariIni: string): { dari: string; sampai: string; kunci: string } {
  if (jadwal === "mingguan") {
    const hari = new Date(`${hariIni}T00:00:00Z`).getUTCDay();
    const seninIni = addDays(hariIni, -((hari + 6) % 7));
    const dari = addDays(seninIni, -7);
    const sampai = addDays(seninIni, -1);
    return { dari, sampai, kunci: kunciMinggu(dari) };
  }
  const awalBulanIni = `${hariIni.slice(0, 7)}-01`;
  const sampai = addDays(awalBulanIni, -1);
  return { dari: `${sampai.slice(0, 7)}-01`, sampai, kunci: sampai.slice(0, 7) };
}
