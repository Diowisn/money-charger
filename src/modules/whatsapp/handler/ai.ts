import { randomBytes } from "node:crypto";
import { validasiAi } from "@/lib/ai";
import { bangunDashboard } from "@/lib/dashboard";
import { rp, tglPendek } from "@/lib/format";
import { susunKonteksInsight, susunKonteksRiwayat, validasiPertanyaan } from "@/lib/insight";
import { batasi } from "@/lib/rate-limit";
import { daftarPilihan, norm } from "@/lib/parse/pos";
import { EKSPOR_MS, KONFIRMASI_MS, TEKS_FALLBACK_KAKU, TEKS_TIDAK_DIKENAL } from "./konstanta";
import { resolveSub } from "./rencana";
import { balasOut, bonus, catatIn, catatOut } from "./transaksi";
import type { SesiApi } from "./types";
import { sha256 } from "./util";

export async function ekspor(s: SesiApi): Promise<string> {
  if (!s.deps.baseUrl) return "APP_BASE_URL belum diatur, tautan ekspor belum bisa dibuat.";
  const token = randomBytes(24).toString("hex");
  await s.r.addPending("ekspor", { hash: sha256(token) }, s.nowMs + EKSPOR_MS);
  return `Unduh semua transaksi (CSV). Tautan berlaku 15 menit dan hanya bisa dipakai sekali:\n${s.deps.baseUrl.replace(/\/$/, "")}/api/export?t=${token}`;
}

export async function aturAi(
  s: SesiApi,
  aksi: "status" | "on" | "off" | "konfirmasi_on" | "konfirmasi_off",
): Promise<string> {
  const c = s.state.config;
  if (aksi === "status") {
    return [
      `AI: ${c.aiAktif ? "aktif" : "nonaktif"}. Pratinjau sebelum dicatat: ${c.aiKonfirmasi ? "aktif" : "nonaktif"}.`,
      `Izin berlaku untuk kalimat bebas, foto, dan pertanyaan "tanya"; perintah kaku tetap diproses lokal.`,
      `Ubah: "ai on", "ai off", "ai konfirmasi on", "ai konfirmasi off".`,
    ].join("\n");
  }
  if (aksi === "on" && !s.deps.ai) {
    return "GROQ_API_KEY belum diatur, jadi AI belum bisa dipakai. Perintah kaku tetap berfungsi.";
  }
  if (aksi === "on") await s.r.setConfig("ai_aktif", "1");
  if (aksi === "off") await s.r.setConfig("ai_aktif", "0");
  if (aksi === "konfirmasi_on") await s.r.setConfig("ai_konfirmasi", "1");
  if (aksi === "konfirmasi_off") await s.r.setConfig("ai_konfirmasi", "0");
  await s.muat();
  if (aksi === "on") return "AI diaktifkan. Kalimat bebas akan dikirim ke provider AI saat dipakai.";
  if (aksi === "off") return "AI dinonaktifkan. Tidak ada pesan yang dikirim ke provider AI; gunakan perintah kaku.";
  if (aksi === "konfirmasi_on") return 'Pratinjau AI diaktifkan. Transaksi hasil AI dicatat setelah kamu balas "ya".';
  return "Pratinjau AI dimatikan. Transaksi hasil AI langsung dicatat dan ditandai (dibaca AI).";
}

export async function tanya(s: SesiApi, teks: string): Promise<string> {
  const v = validasiPertanyaan(teks);
  if (!v.ok) return `${v.error} Contoh: tanya berapa pengeluaran makan 3 bulan terakhir`;
  const batas = batasi(`wa-insight:${s.msg.from}`, 20, 60 * 60_000, s.nowMs);
  if (!batas.boleh) return `Batas tanya-jawab tercapai. Coba lagi dalam ${batas.detikTunggu} detik.`;
  if (!s.deps.insight) return "GROQ_API_KEY belum diatur, jadi asisten tanya-jawab belum bisa dipakai.";
  if (!s.state.config.aiAktif) {
    return 'AI sedang nonaktif, jadi pertanyaan tidak dikirim ke provider. Ketik "ai on" untuk mengaktifkan.';
  }
  const data = bangunDashboard(s.state, s.today);
  const konteks = `${susunKonteksInsight(data)}\n\n${susunKonteksRiwayat(s.state, data)}`;
  const jawaban = await s.deps.insight.tanya(v.teks, konteks);
  return jawaban ?? "Asisten sedang tidak bisa menjawab. Coba lagi sebentar lagi.";
}

export async function bebas(s: SesiApi, teks: string): Promise<string> {
  const adaAngka = /\d/.test(teks);

  // Jawaban atas pertanyaan "untuk apa?" (FR-15)
  if (!adaAngka) {
    const p = await s.r.getPending(["petakan"]);
    if (p) {
      if (p.kedaluwarsaPada < s.nowMs) await s.r.resolvePending(p.id, "kedaluwarsa");
      else {
        const id = resolveSub(s, teks);
        const t = s.state.txs.find((x) => x.id === Number(p.payload.txId));
        const n = norm(teks);
        const lewati = ["tanpa pos", "lewati", "skip", "biarkan", "belum dipetakan", "0"].includes(n);
        if (!t || t.status !== "berlaku") await s.r.resolvePending(p.id, "batal");
        else if (lewati && !id) {
          await s.r.resolvePending(p.id, "selesai");
          return `Baik, ${rp(t.nominal + (t.biayaAdmin ?? 0))} tetap tanpa pos. Kamu bisa memetakannya nanti lewat "koreksi pos <nama pos>".`;
        } else if (id) {
          const sebelum = s.state;
          await s.r.updateTx(t.id, { subPostId: id });
          await s.r.resolvePending(p.id, "selesai");
          await s.muat();
          return `Dipetakan ke ${s.state.subPosts.find((x) => x.id === id)!.nama}.\n${balasOut(s, sebelum, t.id, { kind: "satu", id })}`;
        } else if (teks.trim().split(/\s+/).length <= 5) {
          return `Pos "${teks.trim()}" tidak dikenali. Balas salah satu: ${daftarPilihan(s.state)}.\nAtau "tanpa pos" untuk membiarkannya. Untuk pos baru: pos tambah operasional <nama> 0.`;
        }
      }
    }
    return TEKS_TIDAK_DIKENAL;
  }

  if (!s.deps.ai) return TEKS_FALLBACK_KAKU;
  if (!s.state.config.aiAktif) {
    return 'AI sedang nonaktif, jadi kalimat bebas tidak dikirim ke provider. Ketik "ai on" untuk mengaktifkan, atau pakai perintah kaku seperti "out 25rb kopi".';
  }
  const nama = s.state.subPosts.filter((x) => x.aktif).map((x) => x.nama);
  const raw = await s.deps.ai.parse(teks, nama); // hanya teks pesan + nama sub-pos (FR-74)
  const v = validasiAi(raw, teks, nama, s.today);
  if (!v.ok) {
    return v.alasan === "gaji" ? 'Untuk mencatat gaji, ketik: "gaji masuk 1.8 juta".' : TEKS_FALLBACK_KAKU; // FR-72
  }
  const h = v.hasil;
  const tanggal = h.tanggal ?? s.today;
  const subId = h.subPos ? s.state.subPosts.find((x) => x.nama === h.subPos)?.id ?? null : null;

  if (s.state.config.aiKonfirmasi) {
    await s.r.addPending(
      "ai_preview",
      { intent: h.intent, nominal: h.nominal, label: h.label ?? "", tanggal, subPostId: subId },
      s.nowMs + KONFIRMASI_MS,
    );
    const jenis = h.intent === "out" ? "pengeluaran" : h.intent === "in" ? "pemasukan" : "bonus";
    const pos = subId ? s.state.subPosts.find((x) => x.id === subId)?.nama : null;
    const rincian = [
      `${jenis} ${rp(h.nominal)}`,
      tanggal === s.today ? "hari ini" : `tgl ${tglPendek(tanggal)}`,
      h.label ? `"${h.label}"` : null,
      pos ? `pos ${pos}` : h.intent === "out" ? "pos belum dipetakan" : null,
    ].filter(Boolean).join(", ");
    return `Pratinjau AI (belum dicatat): ${rincian}. Balas "ya" untuk mencatat atau "batal" untuk membatalkan.`;
  }

  if (h.intent === "out") return catatOut(s, { nominal: h.nominal, uraian: h.label ?? "", tanggal, sumber: "ai", subPostId: subId });
  if (h.intent === "in") return catatIn(s, h.nominal, h.label ?? "", "saldo", tanggal, "ai");
  return bonus(s, h.nominal, null, "ai");
}
