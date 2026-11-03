/**
 * AI cadangan (Groq, SRS 7). AI hanya mengubah bahasa bebas jadi data terstruktur.
 * Nominal TIDAK dihitung AI: AI mengembalikan potongan teks, lalu parseAmount yang menghitung.
 */
import { parseAmount } from "./parse/amount";
import { extractDate } from "./parse/date";

export type AiIntent = "out" | "in" | "bonus" | "gaji" | "tidak_jelas";

export interface AiRaw {
  intent?: unknown;
  amount_text?: unknown;
  sub_pos?: unknown;
  tanggal_text?: unknown;
  label?: unknown;
}

export interface AiValid {
  intent: "out" | "in" | "bonus";
  nominal: number;
  /** nama sub-pos persis dari daftar, atau null (belum dipetakan) */
  subPos: string | null;
  tanggal: string | null;
  label: string | null;
}

export type AiVerdict =
  | { ok: true; hasil: AiValid }
  | { ok: false; alasan: "gaji" | "gagal"; detail?: string };

/** Validasi SRS 7.3. Fungsi murni supaya AC-12/AC-13 bisa diuji tanpa jaringan. */
export function validasiAi(raw: AiRaw | null, pesan: string, namaSubPos: string[], today: string): AiVerdict {
  if (!raw || typeof raw !== "object") return { ok: false, alasan: "gagal", detail: "bukan objek" };
  const intent = raw.intent;
  if (intent === "gaji") return { ok: false, alasan: "gaji" }; // tidak boleh dieksekusi langsung (7.3 poin 4)
  if (intent !== "out" && intent !== "in" && intent !== "bonus") return { ok: false, alasan: "gagal", detail: "intent" };

  const amountText = typeof raw.amount_text === "string" ? raw.amount_text.trim() : "";
  if (!amountText || !pesan.toLowerCase().includes(amountText.toLowerCase())) {
    return { ok: false, alasan: "gagal", detail: "amount_text bukan bagian dari pesan" }; // 7.3 poin 1
  }
  const a = parseAmount(amountText);
  if (!a.ok) return { ok: false, alasan: "gagal", detail: a.reason };

  let subPos: string | null = null;
  if (typeof raw.sub_pos === "string") subPos = namaSubPos.find((n) => n === raw.sub_pos) ?? null; // 7.3 poin 3

  let tanggal: string | null = null;
  if (typeof raw.tanggal_text === "string" && raw.tanggal_text.trim()) {
    const t = raw.tanggal_text.trim();
    if (!pesan.toLowerCase().includes(t.toLowerCase())) return { ok: false, alasan: "gagal", detail: "tanggal_text" };
    const d = extractDate(t, today);
    if (d.error || !d.date) return { ok: false, alasan: "gagal", detail: "tanggal" };
    tanggal = d.date;
  }

  const label = typeof raw.label === "string" && raw.label.trim() ? raw.label.trim().slice(0, 80) : null;
  return { ok: true, hasil: { intent, nominal: a.value, subPos, tanggal, label } };
}

export interface AiClient {
  /** Mengembalikan objek JSON mentah, atau null bila gagal/timeout/kuota habis. */
  parse(pesan: string, namaSubPos: string[]): Promise<AiRaw | null>;
}

const SISTEM = `Kamu mengubah satu pesan catatan keuangan pribadi berbahasa Indonesia menjadi JSON.
Balas HANYA dengan satu objek JSON berisi kunci:
- "intent": "out" (pengeluaran), "in" (pemasukan lain), "bonus", "gaji", atau "tidak_jelas"
- "amount_text": potongan teks nominal PERSIS seperti tertulis di pesan (jangan diubah, jangan dihitung)
- "sub_pos": salah satu nama dari daftar yang diberikan PERSIS, atau null bila tidak yakin
- "tanggal_text": potongan teks tanggal persis dari pesan (mis. "kemarin", "tgl 20"), atau null
- "label": uraian singkat, atau null
Jangan menebak nominal. Jika nominal tidak ada di pesan, intent = "tidak_jelas".`;

export function buatGroqClient(env: NodeJS.ProcessEnv = process.env): AiClient | null {
  const key = env.GROQ_API_KEY;
  if (!key) return null;
  const model = env.GROQ_MODEL || "openai/gpt-oss-20b";

  async function sekali(pesan: string, nama: string[]): Promise<AiRaw | null | "ulang"> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20_000);
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        signal: ctrl.signal,
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SISTEM },
            { role: "user", content: `Daftar sub_pos: ${JSON.stringify(nama)}\nPesan: ${JSON.stringify(pesan)}` },
          ],
        }),
      });
      if (res.status === 429) return null; // kuota habis: kegagalan AI (FR-72), tidak diulang
      if (res.status >= 500) return "ulang";
      if (!res.ok) return null;
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const isi = data.choices?.[0]?.message?.content;
      if (!isi) return null;
      return JSON.parse(isi) as AiRaw;
    } catch (e) {
      return (e as Error).name === "AbortError" ? "ulang" : null;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async parse(pesan, nama) {
      // Hanya teks pesan dan nama sub-pos yang dikirim; tidak ada nomor telepon (FR-74).
      const r = await sekali(pesan, nama);
      if (r !== "ulang") return r;
      const r2 = await sekali(pesan, nama); // maksimal 1 percobaan ulang
      return r2 === "ulang" ? null : r2;
    },
  };
}
