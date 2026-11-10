import {
  aktifPlan,
  hitungAkun,
  hitungAwal,
  hitungPeriode,
  hitungWadah,
  nominalItem,
  nominalKeluar,
  periodes,
  planById,
  totalJatahSubPos,
  totalPlan,
} from "./engine";
import { rp } from "./format";
import { addDays, diffDays } from "./parse/date";
import { TURUNAN, type ProfilAkun, type State, type Tx, type TxTipe, type Wadah } from "./types";

export interface PosView {
  id: number;
  nama: string;
  groupId: number;
  grup: string;
  aktif: boolean;
  jatah: number;
  jatahRencana: number;
  terpakai: number;
  sisa: number;
  lewat: number;
}

export interface GrupView {
  id: number;
  nama: string;
  jatah: number;
  terpakai: number;
  pos: PosView[];
}

export interface TxView {
  id: number;
  tipe: TxTipe;
  nominal: number;
  biayaAdmin: number;
  tanggal: string;
  label: string | null;
  detail?: Record<string, string | number | null> | null;
  subPost: string | null;
  wadahAsal: Wadah | null;
  wadahTujuan: Wadah | null;
  status: "berlaku" | "batal";
  bisaDihapus: boolean;
}

export interface DebtView {
  id: number;
  jenis: "piutang" | "utang";
  nama: string;
  nominal: number;
  dibayar: number;
  sisa: number;
  tanggal: string;
  jatuhTempo: string | null;
  catatan: string | null;
  status: "aktif" | "lunas" | "batal";
  lewatTempo: boolean;
}

export interface GoalView {
  id: number;
  nama: string;
  targetNominal: number;
  terkumpul: number;
  sisa: number;
  progres: number;
  tanggal: string;
  targetTanggal: string | null;
  catatan: string | null;
  status: "aktif" | "selesai" | "batal";
  lewatTempo: boolean;
  perluPerBulan: number | null;
  perluPerMinggu: number | null;
}

export interface TrenHari {
  tanggal: string;
  pengeluaran: number;
}

export interface SisaAman {
  hariTersisa: number;
  perHari: number;
  rataHarian: number;
  habisDalamHari: number | null;
  habisTanggal: string | null;
  perkiraan: boolean;
}

export interface PerubahanKategori {
  nama: string;
  sekarang: number;
  sebelumnya: number;
  delta: number;
}

export interface LanggananView {
  nama: string;
  nominal: number;
  terakhir: string;
  perkiraanBerikut: string;
  jumlah: number;
}

export interface DompetView {
  id: number;
  nama: string;
  tipe: string;
  saldoAwal: number;
  saldo: number;
}

export interface AturanView {
  id: number;
  nama: string;
  nominal: number;
  hari: number;
  subPostId: number | null;
  subPost: string | null;
  aktif: boolean;
  mulai: string;
  terakhirJalan: string | null;
  berikutnya: string | null;
}

export interface WawasanData {
  skor: number;
  label: string;
  faktor: string[];
  peringatan: string[];
  proyeksiPengeluaran: number;
  proyeksiSaldo: number;
  rasioTabungan: number;
  langganan: LanggananView[];
  totalLangganan: number;
}

export function kebutuhanTarget(sisa: number, targetTanggal: string | null, hariIni: string): { perBulan: number | null; perMinggu: number | null } {
  if (!targetTanggal || sisa <= 0) return { perBulan: null, perMinggu: null };
  const hari = Math.max(1, diffDays(targetTanggal, hariIni));
  const bulat = (nilai: number) => Math.ceil(nilai / 1000) * 1000;
  return {
    perBulan: bulat(sisa / Math.max(1, Math.ceil(hari / 30))),
    perMinggu: bulat(sisa / Math.max(1, Math.ceil(hari / 7))),
  };
}

export function hitungSisaAman(
  sisaUang: number,
  saldo: number,
  hariIni: string,
  mulai: string | null,
  akhir: string | null,
  tren: TrenHari[],
): SisaAman | null {
  if (!mulai) return null;
  const perkiraan = !akhir;
  const akhirEfektif = akhir ?? addDays(mulai, 30);
  const hariTersisa = Math.max(1, diffDays(akhirEfektif, hariIni) + 1);
  const rataHarian = tren.length ? tren.reduce((s, t) => s + t.pengeluaran, 0) / tren.length : 0;
  const perHari = Math.max(0, Math.floor(sisaUang / hariTersisa / 1000) * 1000);
  const habisDalamHari = rataHarian > 0 ? Math.max(0, Math.ceil(saldo / rataHarian)) : null;
  return {
    hariTersisa,
    perHari,
    rataHarian: Math.round(rataHarian),
    habisDalamHari,
    habisTanggal: habisDalamHari === null ? null : addDays(hariIni, habisDalamHari),
    perkiraan,
  };
}

export function hitungPerubahanKategori(state: State, hariIni: string, batas = 5): PerubahanKategori[] {
  const bulan = hariIni.slice(0, 7);
  const bulanLalu = addDays(`${bulan}-01`, -1).slice(0, 7);
  const sekarang = new Map<string, number>();
  const sebelumnya = new Map<string, number>();
  for (const t of state.txs) {
    if (t.status !== "berlaku" || t.tipe !== "out") continue;
    const nama = namaSubPost(state, t.subPostId) ?? (t.label?.trim() || "Tanpa pos");
    if (t.tanggal.startsWith(bulan)) sekarang.set(nama, (sekarang.get(nama) ?? 0) + nominalKeluar(t));
    else if (t.tanggal.startsWith(bulanLalu)) sebelumnya.set(nama, (sebelumnya.get(nama) ?? 0) + nominalKeluar(t));
  }
  return [...new Set([...sekarang.keys(), ...sebelumnya.keys()])]
    .map((nama) => {
      const kini = sekarang.get(nama) ?? 0;
      const lalu = sebelumnya.get(nama) ?? 0;
      return { nama, sekarang: kini, sebelumnya: lalu, delta: kini - lalu };
    })
    .filter((item) => item.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, batas);
}

export interface DashboardData {
  hariIni: string;
  profil?: ProfilAkun;
  periode: {
    aktif: boolean;
    mulai: string | null;
    akhir: string | null;
    hariKe: number;
    gaji: number;
  };
  ringkasan: {
    pendapatanBulanIni: number;
    pengeluaranBulanIni: number;
    totalRencana: number;
    jatahSubPos: number;
    terpakai: number;
    sisaUang: number;
    rasio: number;
    saldo: number;
    tabungan: number;
    investasi: number;
    dd: number;
    ddSisa: number;
    belumDipetakan: number;
    kekuranganDD: number;
    piutangAktif: number;
    utangAktif: number;
    goalTerkumpulAktif: number;
    goalTargetAktif: number;
  };
  grup: GrupView[];
  tren: TrenHari[];
  sisaAman: SisaAman | null;
  perubahanKategori: PerubahanKategori[];
  wawasan: WawasanData;
  dompet: {
    daftar: DompetView[];
    total: number;
    tabungan: number;
    investasi: number;
    utang: number;
    netWorth: number;
  };
  otomatis: AturanView[];
  piutang: DebtView[];
  goals: GoalView[];
  posLain: { dd: number; tabungan: number; investasi: number; ddSisa: number };
  transaksi: TxView[];
  posSemua: PosView[];
  pengaturan: {
    tanggalMulai: string | null;
    saldoAwal: number;
    tabunganAwal: number;
    investasiAwal: number;
    gajiPokok: number;
    digestAktif: boolean;
    laporanAktif: boolean;
    laporanJadwal: "mingguan" | "bulanan";
  };
  bolehSetup: boolean;
  rencana: { id: number; nama: string; total: number } | null;
  rencanaLain: { dd: number; tabungan: number; investasi: number };
  versiRencana: number;
}

export function jumlahHariBulan(hariIni: string): number {
  const [tahun, bulan] = hariIni.split("-").map(Number);
  return new Date(Date.UTC(tahun, bulan, 0)).getUTCDate();
}

export function proyeksiPengeluaranBulan(pengeluaran: number, hariIni: string): number {
  const hariKe = Math.max(1, Number(hariIni.slice(8, 10)));
  return Math.round((pengeluaran / hariKe) * jumlahHariBulan(hariIni));
}

export function hitungSkorKesehatan(input: { rasioAnggaran: number; rasioTabungan: number; bulanDanaDarurat: number; saldoPositif: boolean }): { nilai: number; label: string } {
  const anggaran = Math.max(0, 35 * (1 - Math.min(1, input.rasioAnggaran)));
  const tabungan = Math.min(30, Math.max(0, (input.rasioTabungan / 0.2) * 30));
  const darurat = Math.min(20, Math.max(0, (input.bulanDanaDarurat / 3) * 20));
  const arus = input.saldoPositif ? 15 : 0;
  const nilai = Math.round(Math.max(0, Math.min(100, anggaran + tabungan + darurat + arus)));
  const label = nilai >= 80 ? "Sangat sehat" : nilai >= 60 ? "Sehat" : nilai >= 40 ? "Cukup" : "Perlu perhatian";
  return { nilai, label };
}

export function deteksiLangganan(state: State, batas = 5): LanggananView[] {
  const grup = new Map<string, Tx[]>();
  for (const t of state.txs) {
    if (t.status !== "berlaku" || t.tipe !== "out" || t.indukId !== null) continue;
    const merchant = typeof t.detail?.merchant === "string" ? t.detail.merchant.trim() : "";
    const nama = merchant || t.label?.trim() || namaSubPost(state, t.subPostId);
    if (!nama) continue;
    const kunci = nama.toLowerCase();
    const isi = grup.get(kunci) ?? [];
    isi.push(t);
    grup.set(kunci, isi);
  }
  const hasil: LanggananView[] = [];
  for (const isi of grup.values()) {
    if (isi.length < 2) continue;
    const bulan = new Set(isi.map((t) => t.tanggal.slice(0, 7)));
    if (bulan.size < 2 || isi.length > bulan.size * 2) continue;
    const rata = isi.reduce((s, t) => s + nominalKeluar(t), 0) / isi.length;
    if (rata <= 0 || isi.some((t) => Math.abs(nominalKeluar(t) - rata) > rata * 0.15)) continue;
    const urut = isi.slice().sort((a, b) => (a.tanggal < b.tanggal ? -1 : a.tanggal > b.tanggal ? 1 : a.id - b.id));
    const terakhir = urut[urut.length - 1];
    const namaTampil = (typeof terakhir.detail?.merchant === "string" && terakhir.detail.merchant.trim()) || terakhir.label?.trim() || namaSubPost(state, terakhir.subPostId) || "Langganan";
    hasil.push({
      nama: namaTampil,
      nominal: Math.round(rata),
      terakhir: terakhir.tanggal,
      perkiraanBerikut: addDays(terakhir.tanggal, 30),
      jumlah: isi.length,
    });
  }
  return hasil.sort((a, b) => b.nominal - a.nominal).slice(0, batas);
}

const POSITIF = new Set<TxTipe>(["gaji", "in", "bonus"]);

function namaSubPost(state: State, id: number | null): string | null {
  if (id === null) return null;
  return state.subPosts.find((s) => s.id === id)?.nama ?? null;
}

function ringkasTx(state: State, t: Tx): TxView {
  return {
    id: t.id,
    tipe: t.tipe,
    nominal: t.nominal,
    biayaAdmin: t.biayaAdmin ?? 0,
    tanggal: t.tanggal,
    label: t.label,
    detail: t.detail ?? null,
    subPost: namaSubPost(state, t.subPostId),
    wadahAsal: t.wadahAsal,
    wadahTujuan: t.wadahTujuan,
    status: t.status,
    bisaDihapus: t.status === "berlaku" && !TURUNAN.has(t.tipe),
  };
}

/**
 * Pengeluaran harian (termasuk biaya admin) untuk `jumlahHari` hari terakhir
 * sampai hariIni, diurutkan dari yang paling lama. Transaksi batal tidak dihitung.
 */
export function hitungTrenPengeluaran(state: State, hariIni: string, jumlahHari = 14): TrenHari[] {
  const mulai = addDays(hariIni, -(jumlahHari - 1));
  const perHari = new Map<string, number>();
  for (const t of state.txs) {
    if (t.status !== "berlaku" || t.tipe !== "out") continue;
    if (t.tanggal < mulai || t.tanggal > hariIni) continue;
    perHari.set(t.tanggal, (perHari.get(t.tanggal) ?? 0) + nominalKeluar(t));
  }
  const hasil: TrenHari[] = [];
  for (let i = 0; i < jumlahHari; i++) {
    const tanggal = addDays(mulai, i);
    hasil.push({ tanggal, pengeluaran: perHari.get(tanggal) ?? 0 });
  }
  return hasil;
}

export function bangunDashboard(state: State, hariIni: string): DashboardData {
  const ps = periodes(state);
  const planAktif = aktifPlan(state);
  const perAktif = [...ps].reverse().find((p) => p.start <= hariIni) ?? null;
  const perBerjalan = perAktif ? hitungPeriode(state, ps, perAktif) : null;
  const statistik = perBerjalan ?? hitungAwal(state, hariIni);
  const planPeriode = perAktif ? planById(state, perAktif.planId) : planAktif;
  const wadah = hitungWadah(state);

  const statMap = new Map(statistik.pos.map((p) => [p.subPostId, p]));
  const grupMap = new Map(state.groups.map((g) => [g.id, g.nama]));

  const posSemua: PosView[] = state.subPosts
    .filter((s) => s.aktif || statMap.has(s.id))
    .sort((a, b) => a.urutan - b.urutan)
    .map((s) => {
      const stat = statMap.get(s.id);
      const jatah = nominalItem(planPeriode, "sub_pos", s.id);
      const jatahRencana = nominalItem(planAktif, "sub_pos", s.id);
      const efektif = stat?.efektif ?? jatah;
      return {
        id: s.id,
        nama: s.nama,
        groupId: s.groupId,
        grup: grupMap.get(s.groupId) ?? "",
        aktif: s.aktif,
        jatah,
        jatahRencana,
        terpakai: stat?.terpakai ?? 0,
        sisa: Math.max(0, efektif - (stat?.terpakai ?? 0)),
        lewat: stat?.lewat ?? 0,
      };
    });

  const grup: GrupView[] = state.groups
    .slice()
    .sort((a, b) => a.urutan - b.urutan)
    .map((g) => {
      const pos = posSemua.filter((p) => p.groupId === g.id && p.aktif);
      return {
        id: g.id,
        nama: g.nama,
        jatah: pos.reduce((s, p) => s + p.jatah, 0),
        terpakai: pos.reduce((s, p) => s + p.terpakai, 0),
        pos,
      };
    });

  const bulan = hariIni.slice(0, 7);
  const berlaku = state.txs.filter((t) => t.status === "berlaku" && t.indukId === null);
  const pendapatanBulanIni = berlaku
    .filter((t) => t.tanggal.startsWith(bulan) && POSITIF.has(t.tipe))
    .reduce((s, t) => s + t.nominal, 0);
  const pengeluaranBulanIni = berlaku
    .filter((t) => t.tanggal.startsWith(bulan) && t.tipe === "out")
    .reduce((s, t) => s + nominalKeluar(t), 0);

  const totalRencana = totalPlan(planPeriode);
  const jatahSubPos = totalJatahSubPos(planPeriode);
  const terpakai = statistik.terpakaiTotal;
  const dd = nominalItem(planPeriode, "dd");
  const ddSisa = statistik.ddSisa;

  const transaksi = state.txs
    .slice()
    .filter((t) => !TURUNAN.has(t.tipe))
    .sort((a, b) => (a.tanggal < b.tanggal ? 1 : a.tanggal > b.tanggal ? -1 : b.id - a.id))
    .slice(0, 120)
    .map((t) => ringkasTx(state, t));

  const piutang: DebtView[] = state.debts
    .filter((d) => d.status !== "batal")
    .map((d) => ({
      id: d.id,
      jenis: d.jenis,
      nama: d.nama,
      nominal: d.nominal,
      dibayar: d.dibayar,
      sisa: Math.max(0, d.nominal - d.dibayar),
      tanggal: d.tanggal,
      jatuhTempo: d.jatuhTempo,
      catatan: d.catatan,
      status: d.status,
      lewatTempo: d.status === "aktif" && Boolean(d.jatuhTempo && d.jatuhTempo < hariIni),
    }))
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "aktif" ? -1 : 1;
      return a.tanggal < b.tanggal ? 1 : a.tanggal > b.tanggal ? -1 : b.id - a.id;
    });
  const piutangAktif = piutang
    .filter((d) => d.status === "aktif" && d.jenis === "piutang")
    .reduce((s, d) => s + d.sisa, 0);
  const utangAktif = piutang
    .filter((d) => d.status === "aktif" && d.jenis === "utang")
    .reduce((s, d) => s + d.sisa, 0);
  const dompetAkun = hitungAkun(state);

  const tren = hitungTrenPengeluaran(state, hariIni);
  const sisaAman = hitungSisaAman(Math.max(0, totalRencana - terpakai), wadah.saldo, hariIni, perAktif?.start ?? null, perAktif?.end ?? null, tren);
  const goals: GoalView[] = state.goals
    .filter((g) => g.status !== "batal")
    .map((g) => {
      const sisa = Math.max(0, g.targetNominal - g.terkumpul);
      const perlu = g.status === "aktif" ? kebutuhanTarget(sisa, g.targetTanggal, hariIni) : { perBulan: null, perMinggu: null };
      return {
        id: g.id,
        nama: g.nama,
        targetNominal: g.targetNominal,
        terkumpul: g.terkumpul,
        sisa,
        progres: g.targetNominal ? Math.min(1, g.terkumpul / g.targetNominal) : 0,
        tanggal: g.tanggal,
        targetTanggal: g.targetTanggal,
        catatan: g.catatan,
        status: g.status,
        lewatTempo: g.status === "aktif" && Boolean(g.targetTanggal && g.targetTanggal < hariIni),
        perluPerBulan: perlu.perBulan,
        perluPerMinggu: perlu.perMinggu,
      };
    })
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "aktif" ? -1 : 1;
      return a.tanggal < b.tanggal ? 1 : a.tanggal > b.tanggal ? -1 : b.id - a.id;
    });
  const goalAktifList = goals.filter((g) => g.status === "aktif");
  const goalTerkumpulAktif = goalAktifList.reduce((s, g) => s + g.terkumpul, 0);
  const goalTargetAktif = goalAktifList.reduce((s, g) => s + g.targetNominal, 0);

  const rasioAnggaran = totalRencana ? terpakai / totalRencana : 0;
  const rasioTabungan = totalRencana ? (nominalItem(planPeriode, "tabungan") + nominalItem(planPeriode, "investasi")) / totalRencana : 0;
  const danaDarurat = wadah.tabungan + wadah.investasi;
  const bulanDanaDarurat = pengeluaranBulanIni > 0 ? danaDarurat / pengeluaranBulanIni : danaDarurat > 0 ? 3 : 0;
  const skor = hitungSkorKesehatan({ rasioAnggaran, rasioTabungan, bulanDanaDarurat, saldoPositif: wadah.saldo >= 0 });
  const langganan = deteksiLangganan(state);
  const proyeksiPengeluaran = proyeksiPengeluaranBulan(pengeluaranBulanIni, hariIni);
  const proyeksiSaldo = wadah.saldo - Math.max(0, proyeksiPengeluaran - pengeluaranBulanIni);
  const peringatan: string[] = [];
  if (rasioAnggaran >= 0.8) peringatan.push(`Anggaran periode sudah terpakai ${Math.round(rasioAnggaran * 100)}%.`);
  if (proyeksiSaldo < 0) peringatan.push(`Proyeksi saldo akhir bulan ${rp(proyeksiSaldo)}.`);
  if (sisaAman && sisaAman.habisDalamHari !== null && sisaAman.habisDalamHari < 7) peringatan.push(`Saldo diperkirakan habis dalam ${sisaAman.habisDalamHari} hari.`);
  for (const item of langganan) {
    const jeda = diffDays(item.perkiraanBerikut, hariIni);
    if (jeda >= 0 && jeda <= 7) peringatan.push(`${item.nama} sekitar ${rp(item.nominal)} jatuh tempo ${item.perkiraanBerikut}.`);
  }

  return {
    hariIni,
    periode: {
      aktif: Boolean(perBerjalan),
      mulai: perAktif?.start ?? null,
      akhir: perAktif?.end ?? null,
      hariKe: perBerjalan ? Math.max(1, diffDays(hariIni, perAktif!.start) + 1) : 0,
      gaji: perAktif?.gaji.nominal ?? 0,
    },
    ringkasan: {
      pendapatanBulanIni,
      pengeluaranBulanIni,
      totalRencana,
      jatahSubPos,
      terpakai,
      sisaUang: Math.max(0, totalRencana - terpakai),
      rasio: totalRencana ? Math.min(1, terpakai / totalRencana) : 0,
      saldo: wadah.saldo,
      tabungan: wadah.tabungan,
      investasi: wadah.investasi,
      dd,
      ddSisa,
      belumDipetakan: statistik.belumDipetakan,
      kekuranganDD: statistik.kekuranganDD,
      piutangAktif,
      utangAktif,
      goalTerkumpulAktif,
      goalTargetAktif,
    },
    grup,
    tren,
    sisaAman,
    perubahanKategori: hitungPerubahanKategori(state, hariIni),
    wawasan: {
      skor: skor.nilai,
      label: skor.label,
      faktor: [
        `Anggaran terpakai ${Math.round(rasioAnggaran * 100)}% dari rencana periode.`,
        `Tabungan + investasi ${Math.round(rasioTabungan * 100)}% dari total rencana.`,
        `Dana darurat + tabungan setara ${bulanDanaDarurat.toFixed(1)} bulan pengeluaran bulan ini.`,
      ],
      peringatan,
      proyeksiPengeluaran,
      proyeksiSaldo,
      rasioTabungan,
      langganan,
      totalLangganan: langganan.reduce((s, item) => s + item.nominal, 0),
    },
    dompet: {
      daftar: dompetAkun.daftar,
      total: dompetAkun.total,
      tabungan: wadah.tabungan,
      investasi: wadah.investasi,
      utang: utangAktif,
      netWorth: dompetAkun.total + wadah.tabungan + wadah.investasi - utangAktif,
    },
    otomatis: [],
    piutang,
    goals,
    posLain: {
      dd,
      tabungan: nominalItem(planPeriode, "tabungan"),
      investasi: nominalItem(planPeriode, "investasi"),
      ddSisa,
    },
    transaksi,
    posSemua,
    pengaturan: {
      tanggalMulai: state.config.tanggalMulai,
      saldoAwal: state.config.saldoAwal,
      tabunganAwal: state.config.tabunganAwal,
      investasiAwal: state.config.investasiAwal,
      gajiPokok: state.config.gajiPokok,
      digestAktif: state.config.digestAktif,
      laporanAktif: state.config.laporanAktif,
      laporanJadwal: state.config.laporanJadwal,
    },
    bolehSetup: ps.length === 0,
    rencana: { id: planAktif.id, nama: planAktif.nama, total: totalPlan(planAktif) },
    rencanaLain: {
      dd: nominalItem(planAktif, "dd"),
      tabungan: nominalItem(planAktif, "tabungan"),
      investasi: nominalItem(planAktif, "investasi"),
    },
    versiRencana: planAktif.id,
  };
}
