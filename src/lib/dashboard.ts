import {
  aktifPlan,
  hitungPeriode,
  hitungWadah,
  nominalItem,
  periodes,
  planById,
  totalJatahSubPos,
  totalPlan,
} from "./engine";
import { diffDays } from "./parse/date";
import { TURUNAN, type State, type Tx, type TxTipe, type Wadah } from "./types";

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
  tanggal: string;
  label: string | null;
  subPost: string | null;
  wadahAsal: Wadah | null;
  wadahTujuan: Wadah | null;
  status: "berlaku" | "batal";
  bisaDihapus: boolean;
}

export interface DashboardData {
  hariIni: string;
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
  };
  grup: GrupView[];
  posLain: { dd: number; tabungan: number; investasi: number; ddSisa: number };
  transaksi: TxView[];
  posSemua: PosView[];
  pengaturan: {
    tanggalMulai: string | null;
    saldoAwal: number;
    tabunganAwal: number;
    investasiAwal: number;
    gajiPokok: number;
  };
  bolehSetup: boolean;
  rencana: { id: number; nama: string; total: number } | null;
  rencanaLain: { dd: number; tabungan: number; investasi: number };
  versiRencana: number;
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
    tanggal: t.tanggal,
    label: t.label,
    subPost: namaSubPost(state, t.subPostId),
    wadahAsal: t.wadahAsal,
    wadahTujuan: t.wadahTujuan,
    status: t.status,
    bisaDihapus: t.status === "berlaku" && !TURUNAN.has(t.tipe),
  };
}

export function bangunDashboard(state: State, hariIni: string): DashboardData {
  const ps = periodes(state);
  const planAktif = aktifPlan(state);
  const per = ps.length ? ps[ps.length - 1] : null;
  const perBerjalan = per && per.start <= hariIni ? hitungPeriode(state, ps, per) : null;
  const planPeriode = per ? planById(state, per.planId) : planAktif;
  const wadah = hitungWadah(state);

  const statMap = new Map((perBerjalan?.pos ?? []).map((p) => [p.subPostId, p]));
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
    .reduce((s, t) => s + t.nominal, 0);

  const totalRencana = totalPlan(planPeriode);
  const jatahSubPos = totalJatahSubPos(planPeriode);
  const terpakai = perBerjalan?.terpakaiTotal ?? 0;
  const dd = nominalItem(planPeriode, "dd");
  const ddSisa = perBerjalan?.ddSisa ?? dd;

  const transaksi = state.txs
    .slice()
    .filter((t) => !TURUNAN.has(t.tipe))
    .sort((a, b) => (a.tanggal < b.tanggal ? 1 : a.tanggal > b.tanggal ? -1 : b.id - a.id))
    .slice(0, 120)
    .map((t) => ringkasTx(state, t));

  return {
    hariIni,
    periode: {
      aktif: Boolean(perBerjalan),
      mulai: per?.start ?? null,
      akhir: per?.end ?? null,
      hariKe: perBerjalan ? Math.max(1, diffDays(hariIni, per!.start) + 1) : 0,
      gaji: per?.gaji.nominal ?? 0,
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
    },
    grup,
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
