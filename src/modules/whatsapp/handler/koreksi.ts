import { hitungWadah, periodes } from "@/lib/engine";
import { rp, tglPendek } from "@/lib/format";
import type { Cmd } from "@/lib/parse/command";
import { cariDalamTeks, cariPersis, daftarPilihan } from "@/lib/parse/pos";
import { KONFIRMASI_MS, PETAKAN_MS } from "./konstanta";
import type { SesiApi } from "./types";
import { catatIn, catatOut, bonus, deskripsi, gaji, balasOut } from "./transaksi";
import { catatanTerakhir } from "./util";

export async function batalkan(s: SesiApi, id: number) {
  await s.r.updateTx(id, { status: "batal" });
  for (const t of s.state.txs.filter((x) => x.indukId === id && x.status === "berlaku")) {
    await s.r.updateTx(t.id, { status: "batal" });
  }
}

export async function hapusTerakhir(s: SesiApi): Promise<string> {
  const t = catatanTerakhir(s.state);
  if (!t) return "Belum ada catatan yang bisa dihapus.";
  if (t.tipe === "gaji") {
    await s.r.addPending("hapus_gaji", { txId: t.id }, s.nowMs + KONFIRMASI_MS);
    return `Menghapus ${deskripsi(s, t)} juga membatalkan alokasi Tabungan, Investasi, dan selisihnya, lalu membuka kembali periode sebelumnya. Balas "ya" untuk melanjutkan atau "batal".`;
  }
  await batalkan(s, t.id);
  await s.muat();
  return `Dibatalkan: ${deskripsi(s, t)}. Saldo sekarang: ${rp(hitungWadah(s.state).saldo)}.`;
}

export async function koreksi(
  s: SesiApi,
  c: Extract<Cmd, { k: "koreksi" }>,
): Promise<string> {
  const lama = catatanTerakhir(s.state);
  if (!lama) return "Belum ada catatan yang bisa dikoreksi.";
  if (lama.tipe !== "out" && lama.tipe !== "in") {
    return `Koreksi hanya untuk catatan out dan in. Untuk ${deskripsi(s, lama)}, ketik "hapus terakhir" lalu catat ulang.`;
  }
  const baru = { ...lama };
  if (c.field === "nominal") baru.nominal = c.nominal;
  else if (c.field === "tanggal") {
    if (c.tanggal > s.today) return "Tanggal di masa depan ditolak.";
    baru.tanggal = c.tanggal;
  } else {
    if (lama.tipe !== "out") return "Koreksi pos hanya untuk pengeluaran.";
    const id = cariPersis(s.state, c.pos) ?? (() => { const k = cariDalamTeks(s.state, c.pos); return k.kind === "satu" ? k.id : null; })();
    if (!id) return `Pos "${c.pos}" tidak dikenali. Pilihan: ${daftarPilihan(s.state)}.`;
    baru.subPostId = id;
  }
  const sebelum = s.state;
  await s.r.updateTx(lama.id, { status: "batal" });
  const { id: _id, status: _s, ...sisa } = baru;
  const idBaru = await s.r.insertTx({ ...sisa, penggantiDari: lama.id, waMessageId: s.msg.id });
  const p = await s.r.getPending(["petakan"]);
  if (p && p.payload.txId === lama.id) await s.r.resolvePending(p.id, "selesai");
  if (baru.tipe === "out" && baru.subPostId === null) await s.r.addPending("petakan", { txId: idBaru }, s.nowMs + PETAKAN_MS);
  await s.muat();
  const kepala = "Koreksi tersimpan: catatan lama dibatalkan, catatan baru dibuat.";
  if (baru.tipe === "out") return `${kepala}\n${balasOut(s, sebelum, idBaru, { kind: "none" })}`;
  return `${kepala}\nPemasukan ${rp(baru.nominal)} tgl ${tglPendek(baru.tanggal)}. Saldo sekarang: ${rp(hitungWadah(s.state).saldo)}.`;
}

export async function konfirmasi(s: SesiApi, jawab: "ya" | "batal"): Promise<string> {
  const p = await s.r.getPending(["gaji_ganda", "hapus_gaji", "ai_preview"]);
  if (!p) return "Tidak ada aksi yang menunggu konfirmasi.";
  if (p.kedaluwarsaPada < s.nowMs) {
    await s.r.resolvePending(p.id, "kedaluwarsa");
    return "Aksi itu sudah kedaluwarsa (lebih dari 10 menit). Ketik ulang perintahnya.";
  }
  if (jawab === "batal") {
    await s.r.resolvePending(p.id, "batal");
    return p.jenis === "ai_preview" ? "Dibatalkan. Tidak ada yang dicatat." : "Dibatalkan. Data tidak berubah.";
  }
  await s.r.resolvePending(p.id, "selesai");
  if (p.jenis === "ai_preview") {
    const intent = String(p.payload.intent);
    const nominal = Number(p.payload.nominal);
    const label = String(p.payload.label ?? "");
    const tanggal = String(p.payload.tanggal);
    const subPostId = p.payload.subPostId === null ? null : Number(p.payload.subPostId);
    if (intent === "out") return catatOut(s, { nominal, uraian: label, tanggal, sumber: "ai", subPostId });
    if (intent === "in") return catatIn(s, nominal, label, "saldo", tanggal, "ai");
    return bonus(s, nominal, null, "ai");
  }
  if (p.jenis === "gaji_ganda") {
    return gaji(s, Number(p.payload.nominal), String(p.payload.tanggal), true);
  }
  const t = s.state.txs.find((x) => x.id === Number(p.payload.txId));
  if (!t || t.status !== "berlaku") return "Gaji itu sudah tidak berlaku.";
  await batalkan(s, t.id);
  await s.muat();
  const ps = periodes(s.state);
  return `Gaji ${rp(t.nominal)} tgl ${tglPendek(t.tanggal)} dibatalkan beserta alokasinya. ${
    ps.length ? `Periode ke-${ps.length} terbuka kembali.` : "Kembali ke periode awal."
  } Saldo sekarang: ${rp(hitungWadah(s.state).saldo)}.`;
}
