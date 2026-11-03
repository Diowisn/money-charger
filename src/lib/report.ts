/** Penyusun teks laporan (teks polos tanpa emoji, SRS 8). */
import { diffDays } from "./parse/date";
import { hitungPeriode, hitungWadah, indeksPeriode, periodes, berlaku, type Evaluasi, type PeriodeHasil, type SaldoWadah } from "./engine";
import { rp, tglPendek } from "./format";
import type { State } from "./types";

export function teksWadah(w: SaldoWadah): string {
  return `Saldo: ${rp(w.saldo)}\nTabungan: ${rp(w.tabungan)}\nInvestasi: ${rp(w.investasi)}`;
}

export function selisihBertanda(n: number): string {
  return `${n >= 0 ? "+" : "-"}${rp(Math.abs(n))}`;
}

/** Ringkasan per grup dengan rincian sub-pos (FR-24, FR-62). */
export function barisGrup(state: State, h: PeriodeHasil): string[] {
  const out: string[] = [];
  for (const g of [...state.groups].sort((a, b) => a.urutan - b.urutan)) {
    const pos = h.pos.filter((p) => p.groupId === g.id);
    if (!pos.length) continue;
    const jatah = pos.reduce((s, p) => s + p.efektif, 0);
    const terpakai = pos.reduce((s, p) => s + p.terpakai, 0);
    out.push(`${g.nama}: terpakai ${rp(terpakai)} dari ${rp(jatah)}`);
    for (const p of pos) {
      const ket = p.lewat > 0 ? `lewat ${rp(p.lewat)}` : `sisa ${rp(p.sisa)}`;
      out.push(`- ${p.nama}: ${rp(p.terpakai)} dari ${rp(p.efektif)} (${ket})`);
    }
  }
  const ddTerpakai = Math.min(h.dd, h.bebanDD);
  out.push(`Dana Darurat: sisa ${rp(h.ddSisa)} dari ${rp(h.dd)}${ddTerpakai ? ` (terpakai ${rp(ddTerpakai)})` : ""}`);
  if (h.kekuranganDD > 0) out.push(`Kekurangan ${rp(h.kekuranganDD)} diambil dari Saldo.`);
  if (h.belumDipetakan > 0) out.push(`Belum dipetakan: ${rp(h.belumDipetakan)} (dihitung ke Dana Darurat)`);
  return out;
}

export function teksLaporan(state: State, today: string): string {
  const ps = periodes(state);
  const w = hitungWadah(state);
  if (!ps.length) {
    const mulai = state.config.tanggalMulai ?? today;
    const total = berlaku(state)
      .filter((t) => t.tipe === "out")
      .reduce((s, t) => s + t.nominal, 0);
    return [
      `Periode awal (mulai ${tglPendek(mulai)}, hari ke-${diffDays(today, mulai) + 1}). Belum ada jatah.`,
      `Pengeluaran tercatat: ${rp(total)}`,
      teksWadah(w),
    ].join("\n");
  }
  const p = ps[ps.length - 1];
  const h = hitungPeriode(state, ps, p);
  return [
    `Laporan periode ke-${p.index} (mulai ${tglPendek(p.start)}, hari ke-${diffDays(today, p.start) + 1})`,
    ...barisGrup(state, h),
    teksWadah(w),
  ].join("\n");
}

export function teksLaporanPeriode(state: State): string {
  const ps = periodes(state);
  if (ps.length < 2) return "Belum ada periode yang tertutup. Periode tertutup setelah gaji berikutnya dicatat.";
  const p = ps[ps.length - 2];
  const h = hitungPeriode(state, ps, p);
  return [
    `Periode ke-${p.index} (${tglPendek(p.start)} sampai sebelum ${tglPendek(p.end!)}), sudah ditutup`,
    ...barisGrup(state, h),
    `Sisa yang masuk Saldo: ${rp(h.sisaTotal)}`,
  ].join("\n");
}

export function teksRencanaVsKenyataan(h: PeriodeHasil): string[] {
  const out = [`Rencana vs kenyataan periode ke-${h.periode.index}:`];
  for (const p of h.pos.filter((x) => x.efektif > 0 || x.terpakai > 0)) {
    const s = p.efektif - p.terpakai;
    out.push(`- ${p.nama}: rencana ${rp(p.efektif)}, terpakai ${rp(p.terpakai)}, ${s >= 0 ? "hemat" : "lewat"} ${rp(Math.abs(s))}`);
  }
  return out;
}

export function teksUsulan(ev: Evaluasi): string[] {
  if (!ev.usulan) return [];
  const out = [`Usulan jatah periode berikutnya (rata-rata ${ev.periodeDipakai} periode terakhir, dibulatkan ke atas Rp10.000):`];
  for (const u of ev.usulan) out.push(`- ${u.nama}: ${rp(u.lama)} jadi ${rp(u.baru)}`);
  out.push(`Total jatah sub-pos: ${rp(ev.totalLama)} jadi ${rp(ev.totalBaru)}.`);
  if (ev.melebihi) out.push("Peringatan: total usulan melebihi total jatah sekarang. Tabungan dan Investasi tidak dipotong otomatis.");
  out.push('Balas "setuju" untuk memakai usulan ini atau "tolak" untuk membuangnya.');
  return out;
}

export function nomorPeriodeSaatIni(state: State): number {
  return indeksPeriode(periodes(state), "9999-12-31");
}

export const TEKS_BANTUAN = [
  "Perintah (huruf besar-kecil bebas):",
  "- out 25rb kopi  (pengeluaran; tambah: kemarin / tgl 20)",
  "- in 150rb freelance  (pemasukan lain; tambah: ke tabungan)",
  "- gaji masuk 1.8 juta  (opsional: tgl 30)",
  "- bonus 200rb  (opsional: ke tabungan)",
  "- koreksi nominal 30rb | koreksi pos jajan | koreksi tanggal kemarin",
  "- hapus terakhir",
  "- saldo | sisa jajan | laporan | laporan periode | evaluasi",
  "- set makan 400rb  (tambah: sekarang)",
  "- geser 50rb dari jajan ke bensin",
  "- pos tambah operasional laundry 50rb | pos ganti <lama> <baru> | pos hapus <nama> | pos alias kopi jajan",
  "- tarik tabungan 200rb",
  "- pindah 100rb dari saldo ke tabungan",
  "- setup 17/10 saldo 300rb tabungan 0 investasi 0  (hanya sebelum gaji pertama)",
  "- ekspor  (tautan CSV)",
  "- ya | batal | setuju | tolak  (jawaban konfirmasi)",
  "Kalimat bebas seperti \"tadi beli kopi 25rb\" juga dicoba dibaca AI.",
].join("\n");
