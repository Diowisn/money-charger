/**
 * AI cadangan untuk membaca foto struk belanja / tangkapan layar transaksi (Groq vision).
 * Mirip ai.ts, tetapi sumbernya gambar, bukan teks, sehingga validasi "amount_text harus
 * muncul persis di pesan" tidak berlaku. Nominal tetap dihitung oleh parseAmount, bukan AI.
 */
import { parseAmount } from "./parse/amount";
import { extractDate } from "./parse/date";
import { catatPemakaian } from "./usage";

export interface StrukRaw {
  intent?: unknown;
  amount_text?: unknown;
  sub_pos?: unknown;
  tanggal_text?: unknown;
  label?: unknown;
  toko?: unknown;
  alamat?: unknown;
  kontak?: unknown;
  konsumen?: unknown;
  kasir?: unknown;
  kategori?: unknown;
  pajak_text?: unknown;
  dibayar_text?: unknown;
  kembalian_text?: unknown;
}

export interface StrukValid {
  nominal: number;
  /** nama sub-pos persis dari daftar, atau null (belum dipetakan) */
  subPos: string | null;
  tanggal: string | null;
  label: string | null;
  toko: string | null;
  alamat: string | null;
  kontak: string | null;
  konsumen: string | null;
  kasir: string | null;
  kategori: string | null;
  pajak: number | null;
  dibayar: number | null;
  kembalian: number | null;
}

function teksOpsional(nilai: unknown, maks = 120): string | null {
  return typeof nilai === "string" && nilai.trim() ? nilai.trim().slice(0, maks) : null;
}

function nominalOpsional(nilai: unknown): number | null {
  if (typeof nilai !== "string" || !nilai.trim()) return null;
  const a = parseAmount(normalisasiNominalStruk(nilai), { izinkanNol: true });
  return a.ok ? a.value : null;
}

/**
 * Struk Indonesia sering menulis ribuan dengan koma ("6,700") atau titik + desimal
 * ("1.175.000,00"). parseAmount sengaja ketat untuk teks chat, jadi format struk
 * dinormalkan lebih dulu: buang Rp/spasi, lalu hilangkan pemisah ribuan/desimal.
 */
export function normalisasiNominalStruk(teks: string): string {
  const tanpaRp = teks
    .trim()
    .replace(/^rp\.?\s*/i, "")
    .replace(/^(?:\(|\[)+/, "")
    .replace(/[)\]]+$/, "")
    .trim();
  const cocok = /(\d[\d.,]*)\s*$/.exec(tanpaRp);
  const angka = (cocok?.[1] ?? tanpaRp).replace(/\s+/g, "");
  if (!/^\d[\d.,]*$/.test(angka)) return teks;
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(angka)) return angka.replace(/\./g, "").replace(/,\d{1,2}$/, "");
  if (/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(angka)) return angka.replace(/,/g, "").replace(/\.\d{1,2}$/, "");
  if (/^\d+,\d{1,2}$/.test(angka)) return angka.replace(/,\d{1,2}$/, "");
  return angka;
}

export type StrukVerdict =
  | { ok: true; hasil: StrukValid }
  | { ok: false; alasan: "tidak_jelas" | "gagal"; detail?: string };

/** Fungsi murni supaya bisa diuji tanpa jaringan/gambar sungguhan. */
export function validasiStruk(raw: StrukRaw | null, namaSubPos: string[], today: string): StrukVerdict {
  if (!raw || typeof raw !== "object") return { ok: false, alasan: "gagal", detail: "bukan objek" };
  if (raw.intent === "tidak_jelas") return { ok: false, alasan: "tidak_jelas" };
  if (raw.intent !== "out") return { ok: false, alasan: "gagal", detail: "intent" };

  const amountText = typeof raw.amount_text === "string" ? raw.amount_text.trim() : "";
  if (!amountText) return { ok: false, alasan: "tidak_jelas", detail: "amount_text kosong" };
  const a = parseAmount(normalisasiNominalStruk(amountText));
  if (!a.ok) return { ok: false, alasan: "tidak_jelas", detail: a.reason };

  let subPos: string | null = null;
  if (typeof raw.sub_pos === "string") subPos = namaSubPos.find((n) => n === raw.sub_pos) ?? null;

  let tanggal: string | null = null;
  if (typeof raw.tanggal_text === "string" && raw.tanggal_text.trim()) {
    const d = extractDate(raw.tanggal_text.trim(), today);
    if (!d.error && d.date) tanggal = d.date; // gagal parse tanggal -> abaikan, pakai tanggal hari ini
  }

  const toko = teksOpsional(raw.toko);
  const label = toko ?? teksOpsional(raw.label, 80);
  return {
    ok: true,
    hasil: {
      nominal: a.value,
      subPos,
      tanggal,
      label,
      toko,
      alamat: teksOpsional(raw.alamat),
      kontak: teksOpsional(raw.kontak, 40),
      konsumen: teksOpsional(raw.konsumen),
      kasir: teksOpsional(raw.kasir, 60),
      kategori: teksOpsional(raw.kategori, 60),
      pajak: nominalOpsional(raw.pajak_text),
      dibayar: nominalOpsional(raw.dibayar_text),
      kembalian: nominalOpsional(raw.kembalian_text),
    },
  };
}

export interface VisionClient {
  /** Mengembalikan objek JSON mentah, atau null bila gagal/timeout/kuota habis. */
  parseReceipt(imageBase64: string, mimeType: string, namaSubPos: string[], caption?: string): Promise<StrukRaw | null>;
}

const SISTEM_STRUK = `Kamu membaca foto struk belanja atau tangkapan layar transaksi (bank/e-wallet) berbahasa Indonesia.
Balas HANYA dengan satu objek JSON berisi kunci:
- "intent": "out" bila ini jelas pengeluaran/pembayaran, atau "tidak_jelas" bila gambar tidak bisa dibaca atau bukan struk/transaksi
- "amount_text": nominal TOTAL akhir yang dibayar PERSIS seperti tertulis di gambar, termasuk pajak/biaya admin/biaya transfer bila ada. Bila ada baris "Total", pakai angka itu. Jangan dihitung ulang.
- "sub_pos": salah satu nama dari daftar yang diberikan PERSIS, atau null bila tidak yakin
- "tanggal_text": tanggal transaksi persis seperti tertulis di gambar (mis. "20/10/2026"), atau null bila tidak terlihat
- "toko": nama toko/merchant, atau null
- "alamat": alamat toko, atau null
- "kontak": nomor telepon toko, atau null
- "konsumen": nama konsumen/pelanggan, atau null
- "kasir": nama kasir, atau null
- "kategori": kategori transaksi bila tertulis di struk, atau null
- "pajak_text": nominal pajak/PPN persis seperti tertulis, atau null
- "dibayar_text": nominal uang dibayar persis seperti tertulis, atau null
- "kembalian_text": nominal kembalian persis seperti tertulis, atau null
- "label": keterangan singkat bila "toko" tidak ada, atau null
Jika nominal total tidak terlihat jelas, intent harus "tidak_jelas".`;

export function buatGroqVisionClient(env: NodeJS.ProcessEnv = process.env): VisionClient | null {
  const key = env.GROQ_API_KEY;
  if (!key) return null;
  const model = env.GROQ_VISION_MODEL || "qwen/qwen3.8-27b";

  async function sekali(
    b64: string,
    mime: string,
    nama: string[],
    caption?: string,
  ): Promise<StrukRaw | null | "ulang"> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25_000);
    try {
      const teksUser = `Daftar sub_pos: ${JSON.stringify(nama)}${caption ? `\nCatatan dari pengguna: ${JSON.stringify(caption)}` : ""}`;
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        signal: ctrl.signal,
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SISTEM_STRUK },
            {
              role: "user",
              content: [
                { type: "text", text: teksUser },
                { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } },
              ],
            },
          ],
        }),
      });
      if (res.status === 429) return null; // kuota habis
      if (res.status >= 500) return "ulang";
      if (!res.ok) return null;
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const isi = data.choices?.[0]?.message?.content;
      if (!isi) return null;
      return JSON.parse(isi) as StrukRaw;
    } catch (e) {
      return (e as Error).name === "AbortError" ? "ulang" : null;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async parseReceipt(imageBase64, mimeType, namaSubPos, caption) {
      void catatPemakaian("ai_vision");
      const r = await sekali(imageBase64, mimeType, namaSubPos, caption);
      if (r !== "ulang") return r;
      const r2 = await sekali(imageBase64, mimeType, namaSubPos, caption); // maksimal 1 percobaan ulang
      return r2 === "ulang" ? null : r2;
    },
  };
}
