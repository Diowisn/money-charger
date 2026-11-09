import { rp, tglPendek } from "@/lib/format";
import { norm } from "@/lib/parse/pos";
import type { SesiApi } from "./types";
import { judul } from "./util";

export async function goalTambah(s: SesiApi, nominal: number, nama: string, targetTanggal: string | null): Promise<string> {
  const id = await s.r.addGoal({
    nama: judul(nama.trim()),
    targetNominal: nominal,
    terkumpul: 0,
    tanggal: s.today,
    targetTanggal,
    catatan: null,
  });
  await s.muat();
  const g = s.state.goals.find((x) => x.id === id)!;
  const jt = targetTanggal ? ` Target tercapai sebelum ${tglPendek(targetTanggal)}.` : "";
  return `Target tabungan dicatat: ${g.nama}, ${rp(nominal)}.${jt} Ketik "nabung <nominal> ${g.nama}" untuk menabung, atau "target" untuk lihat progres.`;
}

export function goalDaftar(s: SesiApi): string {
  const aktif = s.state.goals.filter((g) => g.status === "aktif");
  if (!aktif.length) return "Target tabungan aktif: tidak ada.";
  const baris = aktif.map((g) => {
    const persen = g.targetNominal ? Math.round((g.terkumpul / g.targetNominal) * 100) : 0;
    const lewat = g.targetTanggal && g.targetTanggal < s.today;
    return `- ${g.nama}: ${rp(g.terkumpul)} dari ${rp(g.targetNominal)} (${persen}%)${g.targetTanggal ? `, target ${tglPendek(g.targetTanggal)}${lewat ? " (lewat)" : ""}` : ""}`;
  });
  return ["Target tabungan aktif:", ...baris].join("\n");
}

export async function goalNabung(s: SesiApi, nama: string, nominal: number): Promise<string> {
  const n = norm(nama);
  const cocok = s.state.goals.filter((g) => g.status === "aktif" && norm(g.nama).includes(n));
  if (!cocok.length) return `Tidak ada target tabungan aktif bernama "${nama}". Ketik "target" untuk lihat daftar.`;
  if (cocok.length > 1) {
    return `Ada lebih dari satu target cocok: ${cocok.map((g) => g.nama).join(", ")}. Sebutkan nama lebih lengkap.`;
  }
  const g = cocok[0];
  const terkumpul = g.terkumpul + nominal;
  const selesai = terkumpul >= g.targetNominal;
  await s.r.updateGoal(g.id, { terkumpul, status: selesai ? "selesai" : "aktif" });
  await s.muat();
  return selesai
    ? `${rp(nominal)} ditabung ke ${g.nama}. Target tercapai! Total terkumpul ${rp(terkumpul)}.`
    : `${rp(nominal)} ditabung ke ${g.nama}. Terkumpul ${rp(terkumpul)} dari ${rp(g.targetNominal)} (sisa ${rp(g.targetNominal - terkumpul)}).`;
}
