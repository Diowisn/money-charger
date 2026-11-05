/**
 * Mesin uang: fungsi murni (SRS 3). Semua besaran diturunkan dari daftar transaksi;
 * tidak ada yang disimpan, jadi transaksi mundur otomatis memperbaiki periode lama.
 */
import type { Config, PlanItem, PlanVersion, State, Tx, Wadah } from "./types";

export function parseConfig(m: Record<string, string>): Config {
  const n = (k: string, d: number) => (m[k] !== undefined && m[k] !== "" ? Number(m[k]) : d);
  return {
    tanggalMulai: m.tanggal_mulai ?? null,
    saldoAwal: n("saldo_awal", 0),
    tabunganAwal: n("tabungan_awal", 0),
    investasiAwal: n("investasi_awal", 0),
    ambangGajiGanda: n("ambang_gaji_ganda", 20),
    persenJajan: n("persen_jajan", 50),
    gajiPokok: n("gaji_pokok", 1_800_000),
    bonusSubPostId: m.bonus_subpos_id ? Number(m.bonus_subpos_id) : null,
    // Bawaan aktif agar perilaku lama tetap jalan; "ai off" mencabut izin.
    aiAktif: m.ai_aktif !== "0",
    aiKonfirmasi: m.ai_konfirmasi !== "0",
  };
}

// ---------- rencana ----------

export function aktifPlan(state: State): PlanVersion {
  const p = [...state.plans].reverse().find((x) => x.status === "aktif");
  if (!p) throw new Error("Tidak ada rencana aktif. Jalankan npm run db:setup.");
  return p;
}

export function planById(state: State, id: number | null): PlanVersion {
  return state.plans.find((p) => p.id === id) ?? aktifPlan(state);
}

export function totalPlan(plan: PlanVersion): number {
  return plan.items.reduce((s, i) => s + i.nominal, 0);
}

export function nominalItem(plan: PlanVersion, tipe: PlanItem["tipe"], subPostId: number | null = null): number {
  return plan.items.find((i) => i.tipe === tipe && i.subPostId === subPostId)?.nominal ?? 0;
}

export function totalJatahSubPos(plan: PlanVersion): number {
  return plan.items.filter((i) => i.tipe === "sub_pos").reduce((s, i) => s + i.nominal, 0);
}

// ---------- periode ----------

export interface Periode {
  index: number; // 1, 2, ...
  gaji: Tx;
  start: string;
  end: string | null; // tanggal gaji berikutnya (eksklusif)
  planId: number | null;
}

export const berlaku = (state: State): Tx[] => state.txs.filter((t) => t.status === "berlaku");

/** Nominal keluar efektif: pengeluaran ditambah biaya admin (bila ada). */
export const nominalKeluar = (t: Tx): number => (t.tipe === "out" ? t.nominal + (t.biayaAdmin ?? 0) : t.nominal);

const urut = (a: Tx, b: Tx) => (a.tanggal < b.tanggal ? -1 : a.tanggal > b.tanggal ? 1 : a.id - b.id);

export function periodes(state: State): Periode[] {
  const g = berlaku(state).filter((t) => t.tipe === "gaji").sort(urut);
  return g.map((gaji, i) => ({
    index: i + 1,
    gaji,
    start: gaji.tanggal,
    end: g[i + 1]?.tanggal ?? null,
    planId: gaji.planVersionId,
  }));
}

/** 0 = periode awal (sebelum gaji pertama). */
export function indeksPeriode(ps: Periode[], tanggal: string): number {
  let idx = 0;
  for (const p of ps) if (p.start <= tanggal) idx = p.index;
  return idx;
}

const dalam = (p: Periode, t: Tx) => t.tanggal >= p.start && (p.end === null || t.tanggal < p.end);

export interface PosStat {
  subPostId: number;
  nama: string;
  groupId: number;
  jatah: number;
  tambahan: number;
  geserNet: number;
  efektif: number;
  terpakai: number;
  lewat: number;
  sisa: number;
}

export interface RingkasanPeriode {
  pos: PosStat[];
  belumDipetakan: number;
  dd: number;
  bebanDD: number;
  ddSisa: number;
  kekuranganDD: number;
  /** Σ sisa sub-pos + sisa DD: jumlah yang masuk Saldo saat periode ditutup */
  sisaTotal: number;
  terpakaiTotal: number;
}

export interface PeriodeHasil extends RingkasanPeriode {
  periode: Periode;
  tertutup: boolean;
}

function ringkasPeriode(state: State, plan: PlanVersion, txs: Tx[]): RingkasanPeriode {
  const pos: PosStat[] = [];
  for (const s of state.subPosts) {
    const jatah = nominalItem(plan, "sub_pos", s.id);
    let tambahan = 0;
    let geserNet = 0;
    let terpakai = 0;
    for (const t of txs) {
      if (t.tipe === "out" && t.subPostId === s.id) terpakai += nominalKeluar(t);
      else if (t.tipe === "tambahan_jatah" && t.subPostId === s.id) tambahan += t.nominal;
      else if (t.tipe === "geser") {
        if (t.subPostId === s.id) geserNet -= t.nominal;
        if (t.subPostIdTujuan === s.id) geserNet += t.nominal;
      }
    }
    if (!s.aktif && !jatah && !tambahan && !geserNet && !terpakai) continue;
    const efektif = jatah + tambahan + geserNet;
    pos.push({
      subPostId: s.id,
      nama: s.nama,
      groupId: s.groupId,
      jatah,
      tambahan,
      geserNet,
      efektif,
      terpakai,
      lewat: Math.max(0, terpakai - efektif),
      sisa: Math.max(0, efektif - terpakai),
    });
  }

  const belumDipetakan = txs
    .filter((t) => t.tipe === "out" && t.subPostId === null)
    .reduce((s, t) => s + nominalKeluar(t), 0);
  const dd = nominalItem(plan, "dd");
  const bebanDD = pos.reduce((s, x) => s + x.lewat, 0) + belumDipetakan;
  const ddSisa = Math.max(0, dd - bebanDD);
  const kekuranganDD = Math.max(0, bebanDD - dd);
  const sisaSub = pos.reduce((s, x) => s + x.sisa, 0);

  return {
    pos,
    belumDipetakan,
    dd,
    bebanDD,
    ddSisa,
    kekuranganDD,
    sisaTotal: sisaSub + ddSisa,
    terpakaiTotal: pos.reduce((s, x) => s + x.terpakai, 0) + belumDipetakan,
  };
}

export function hitungPeriode(state: State, ps: Periode[], p: Periode): PeriodeHasil {
  const plan = planById(state, p.planId);
  const txs = berlaku(state).filter((t) => dalam(p, t));
  return {
    periode: p,
    tertutup: p.index < ps.length,
    ...ringkasPeriode(state, plan, txs),
  };
}

export function hitungAwal(state: State, hariIni: string): RingkasanPeriode {
  const ps = periodes(state);
  const plan = aktifPlan(state);
  const batas = ps[0]?.start ?? null;
  const txs = berlaku(state).filter(
    (t) => t.tanggal <= hariIni && (batas === null || t.tanggal < batas),
  );
  return ringkasPeriode(state, plan, txs);
}

// ---------- wadah ----------

export type SaldoWadah = Record<Wadah, number>;

const TIPE_WADAH = new Set(["in", "bonus", "pindah", "tarik", "alokasi_gaji", "selisih_gaji"]);

export function hitungWadah(state: State): SaldoWadah {
  const c = state.config;
  const w: SaldoWadah = { saldo: c.saldoAwal, tabungan: c.tabunganAwal, investasi: c.investasiAwal };
  const ps = periodes(state);
  for (const t of berlaku(state)) {
    if (t.tipe === "out") {
      if (indeksPeriode(ps, t.tanggal) === 0) w.saldo -= nominalKeluar(t); // periode awal: langsung kurangi Saldo
    } else if (TIPE_WADAH.has(t.tipe)) {
      if (t.wadahAsal) w[t.wadahAsal] -= t.nominal;
      if (t.wadahTujuan) w[t.wadahTujuan] += t.nominal;
    }
  }
  for (const p of ps) {
    const h = hitungPeriode(state, ps, p);
    w.saldo -= h.kekuranganDD; // kekurangan DD langsung terasa di Saldo, termasuk di periode berjalan
    if (h.tertutup) w.saldo += h.sisaTotal; // sisa baru masuk Saldo saat periode ditutup gaji berikutnya
  }
  return w;
}

// ---------- bonus ----------

export function bagiBonus(b: number, persenJajan: number): { jajan: number; saldo: number } {
  const jajan = Math.floor((b * persenJajan) / 100);
  return { jajan, saldo: b - jajan };
}

// ---------- evaluasi ----------

export interface BarisEval {
  subPostId: number;
  nama: string;
  jatah: number;
  terpakai: number;
  selisih: number; // jatah - terpakai; negatif = lewat
}

export interface Evaluasi {
  acuan: PeriodeHasil | null;
  baris: BarisEval[];
  periodeDipakai: number;
  usulan: { subPostId: number; nama: string; lama: number; baru: number }[] | null;
  totalLama: number;
  totalBaru: number;
  melebihi: boolean;
  /** true bila periode tertutup ada tetapi tidak ada pengeluaran tercatat sama sekali */
  tanpaData: boolean;
}

export const BULATKAN = 10_000;

export function evaluasi(state: State): Evaluasi {
  const ps = periodes(state);
  const tertutup = ps.slice(0, -1);
  const acuanP = tertutup.length ? tertutup[tertutup.length - 1] : ps[ps.length - 1];
  const acuan = acuanP ? hitungPeriode(state, ps, acuanP) : null;

  const baris: BarisEval[] = (acuan?.pos ?? [])
    .filter((x) => x.jatah > 0 || x.terpakai > 0)
    .map((x) => ({ subPostId: x.subPostId, nama: x.nama, jatah: x.efektif, terpakai: x.terpakai, selisih: x.efektif - x.terpakai }));

  const dipakai = tertutup.slice(-3);
  const plan = aktifPlan(state);
  const totalLama = totalJatahSubPos(plan);
  if (!dipakai.length) {
    return { acuan, baris, periodeDipakai: 0, usulan: null, totalLama, totalBaru: totalLama, melebihi: false, tanpaData: false };
  }

  const hasil = dipakai.map((p) => hitungPeriode(state, ps, p));
  if (hasil.every((h) => h.terpakaiTotal === 0)) {
    // Tidak ada pengeluaran tercatat: rata-rata nol akan menyarankan semua jatah jadi Rp0, tidak berguna.
    return { acuan, baris, periodeDipakai: dipakai.length, usulan: null, totalLama, totalBaru: totalLama, melebihi: false, tanpaData: true };
  }
  const usulan = plan.items
    .filter((i) => i.tipe === "sub_pos" && i.subPostId !== null)
    .map((i) => {
      const jumlah = hasil.reduce((s, h) => s + (h.pos.find((x) => x.subPostId === i.subPostId)?.terpakai ?? 0), 0);
      const baru = Math.ceil(jumlah / (dipakai.length * BULATKAN)) * BULATKAN; // rata-rata dibulatkan ke atas
      const sp = state.subPosts.find((s) => s.id === i.subPostId)!;
      return { subPostId: sp.id, nama: sp.nama, lama: i.nominal, baru };
    });
  const totalBaru = usulan.reduce((s, u) => s + u.baru, 0);
  return { acuan, baris, periodeDipakai: dipakai.length, usulan, totalLama, totalBaru, melebihi: totalBaru > totalLama, tanpaData: false };
}

export function itemUsulan(plan: PlanVersion, usulan: { subPostId: number; baru: number }[]): PlanItem[] {
  return plan.items.map((i) => {
    const u = i.tipe === "sub_pos" ? usulan.find((x) => x.subPostId === i.subPostId) : undefined;
    return u ? { ...i, nominal: u.baru } : { ...i };
  });
}
