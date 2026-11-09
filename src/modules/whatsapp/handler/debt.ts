import { rp, tglPendek } from "@/lib/format";
import { norm } from "@/lib/parse/pos";
import type { SesiApi } from "./types";
import { judul } from "./util";

export async function debtTambah(
  s: SesiApi,
  jenis: "piutang" | "utang",
  nominal: number,
  nama: string,
  jatuhTempo: string | null,
): Promise<string> {
  const id = await s.r.addDebt({
    jenis,
    nama: judul(nama.trim()),
    nominal,
    dibayar: 0,
    tanggal: s.today,
    jatuhTempo,
    catatan: null,
  });
  await s.muat();
  const d = s.state.debts.find((x) => x.id === id)!;
  const label = jenis === "piutang" ? "Piutang (orang berutang ke kita)" : "Utang (kita berutang)";
  const jt = jatuhTempo ? ` Jatuh tempo ${tglPendek(jatuhTempo)}.` : "";
  return `${label} dicatat: ${rp(nominal)} atas nama ${d.nama}.${jt} Ketik "${jenis}" untuk lihat daftar, atau "lunasi ${jenis} ${d.nama}" bila sudah lunas.`;
}

export function debtDaftar(s: SesiApi, jenis: "piutang" | "utang"): string {
  const aktif = s.state.debts.filter((d) => d.status === "aktif" && d.jenis === jenis);
  const label = jenis === "piutang" ? "Piutang aktif (orang berutang ke kita)" : "Utang aktif (kita berutang)";
  if (!aktif.length) return `${label}: tidak ada.`;
  const total = aktif.reduce((n, d) => n + (d.nominal - d.dibayar), 0);
  const baris = aktif.map((d) => {
    const sisa = d.nominal - d.dibayar;
    const lewat = d.jatuhTempo && d.jatuhTempo < s.today;
    return `- ${d.nama}: sisa ${rp(sisa)} dari ${rp(d.nominal)}${d.jatuhTempo ? `, jatuh tempo ${tglPendek(d.jatuhTempo)}${lewat ? " (lewat tempo)" : ""}` : ""}`;
  });
  return [`${label} (total ${rp(total)}):`, ...baris].join("\n");
}

export async function debtBayar(
  s: SesiApi,
  jenis: "piutang" | "utang",
  nama: string,
  nominal: number | null,
): Promise<string> {
  const n = norm(nama);
  const cocok = s.state.debts.filter((d) => d.status === "aktif" && d.jenis === jenis && norm(d.nama).includes(n));
  if (!cocok.length) return `Tidak ada ${jenis} aktif atas nama "${nama}".`;
  if (cocok.length > 1) {
    return `Ada lebih dari satu ${jenis} cocok: ${cocok.map((d) => d.nama).join(", ")}. Sebutkan nama lebih lengkap.`;
  }
  const d = cocok[0];
  const sisa = d.nominal - d.dibayar;
  const bayar = nominal ?? sisa;
  if (bayar > sisa) return `Nominal ${rp(bayar)} melebihi sisa ${jenis} ${rp(sisa)}.`;
  const dibayar = d.dibayar + bayar;
  const lunas = dibayar >= d.nominal;
  await s.r.updateDebt(d.id, { dibayar, status: lunas ? "lunas" : "aktif" });
  await s.muat();
  const kataArah = jenis === "piutang" ? `diterima dari ${d.nama}` : `dibayar ke ${d.nama}`;
  return lunas
    ? `${rp(bayar)} ${kataArah}. ${judul(jenis)} ini lunas.`
    : `${rp(bayar)} ${kataArah}. Sisa ${jenis}: ${rp(d.nominal - dibayar)}.`;
}
