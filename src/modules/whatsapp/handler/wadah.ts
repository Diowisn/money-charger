import { hitungPeriode, hitungWadah, periodes } from "@/lib/engine";
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
