import { hitungPeriode, hitungWadah, periodes, planById, totalPlan } from "@/lib/engine";
import { hitungSisaAman, hitungTrenPengeluaran } from "@/lib/dashboard";
import { rp } from "@/lib/format";
import { daftarPilihan, norm } from "@/lib/parse/pos";
import { teksWadah } from "@/lib/report";
import { buatTx, type Wadah } from "@/lib/types";
import { resolveSub } from "./rencana";
import type { SesiApi } from "./types";

export async function pindah(s: SesiApi, nominal: number, dari: Wadah, ke: Wadah, tipe: "tarik" | "pindah"): Promise<string> {
  const w = hitungWadah(s.state);
  if (dari !== "saldo" && w[dari] < nominal) return `Ditolak: isi ${dari} hanya ${rp(w[dari])}, kurang dari ${rp(nominal)}.`; // FR-36
  await s.r.insertTx(buatTx({ tipe, nominal, wadahAsal: dari, wadahTujuan: ke, tanggal: s.today, waMessageId: s.msg.id }));
  await s.muat();
  return `${tipe === "tarik" ? "Ditarik" : "Dipindahkan"} ${rp(nominal)} dari ${dari} ke ${ke}.\n${teksWadah(hitungWadah(s.state))}`;
}

export function aman(s: SesiApi): string {
  const ps = periodes(s.state);
  if (!ps.length) return "Belum ada periode berjalan. Catat gaji dulu agar batas aman harian bisa dihitung.";
  const aktif = ps[ps.length - 1];
  const h = hitungPeriode(s.state, ps, aktif);
  const w = hitungWadah(s.state);
  const plan = planById(s.state, aktif.planId);
  const tren = hitungTrenPengeluaran(s.state, s.today);
  const hasil = hitungSisaAman(Math.max(0, totalPlan(plan) - h.terpakaiTotal), w.saldo, s.today, aktif.start, aktif.end, tren);
  if (!hasil) return "Belum ada periode berjalan. Catat gaji dulu agar batas aman harian bisa dihitung.";
  const status = hasil.perHari >= hasil.rataHarian ? "Aman" : "Ketat";
  const baris = [
    `Sisa aman: ${rp(hasil.perHari)}/hari untuk ${hasil.hariTersisa} hari${hasil.perkiraan ? " (perkiraan 30 hari sejak gaji)" : ""}.`,
    `Rata-rata belanja 14 hari: ${rp(hasil.rataHarian)}/hari.`,
  ];
  if (hasil.habisDalamHari !== null) baris.push(`Saldo ${rp(w.saldo)} cukup sekitar ${hasil.habisDalamHari} hari (${hasil.habisTanggal}).`);
  baris.push(`Status: ${status}.`);
  return baris.join("\n");
}

export function sisa(s: SesiApi, pos: string): string {
  const ps = periodes(s.state);
  if (!ps.length) return "Belum ada periode berjalan (periode awal belum punya jatah). Ketik gaji setelah gaji masuk.";
  const h = hitungPeriode(s.state, ps, ps[ps.length - 1]);
  const n = norm(pos);
  if (n === "dd" || n === "dana darurat") {
    return `Dana Darurat: sisa ${rp(h.ddSisa)} dari ${rp(h.dd)}${h.kekuranganDD ? `, kekurangan ${rp(h.kekuranganDD)} diambil dari Saldo` : ""}.`;
  }
  const id = resolveSub(s, pos);
  const st = id ? h.pos.find((x) => x.subPostId === id) : null;
  if (!st) return `Pos "${pos}" tidak dikenali. Pilihan: ${daftarPilihan(s.state)}, dd.`;
  return `${st.nama}: jatah efektif ${rp(st.efektif)}, terpakai ${rp(st.terpakai)}, sisa ${rp(st.sisa)}${st.lewat ? `, lewat ${rp(st.lewat)} (ditutup Dana Darurat)` : ""}.`;
}
