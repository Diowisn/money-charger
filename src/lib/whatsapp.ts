import { createHmac, timingSafeEqual } from "node:crypto";
import { splitPesan } from "./format";

/** Verifikasi X-Hub-Signature-256 atas body mentah (NFR-08). */
export function verifySignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header || !header.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const given = header.slice("sha256=".length);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(given, "hex");
  return a.length === b.length && b.length > 0 && timingSafeEqual(a, b);
}

export interface PesanMasuk {
  id: string;
  from: string;
  type: string;
  text?: string;
  timestampMs: number;
}

/** Mengambil pesan dari payload webhook; notifikasi status (terkirim/dibaca) diabaikan. */
export function ekstrakPesan(payload: any): PesanMasuk[] {
  const out: PesanMasuk[] = [];
  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      for (const m of change?.value?.messages ?? []) {
        if (!m?.id || !m?.from) continue;
        out.push({
          id: String(m.id),
          from: String(m.from).replace(/[^0-9]/g, ""),
          type: String(m.type ?? "unknown"),
          text: m.type === "text" ? String(m.text?.body ?? "") : undefined,
          timestampMs: Number(m.timestamp) > 0 ? Number(m.timestamp) * 1000 : Date.now(),
        });
      }
    }
  }
  return out;
}

export function maskNomor(n: string): string {
  return n.length > 6 ? `${n.slice(0, 4)}***${n.slice(-2)}` : "***";
}

/** Kirim balasan teks lewat Cloud API. Phone Number ID dan token hanya dari env (FR-83). */
export async function kirimBalasan(to: string, teks: string, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const phoneId = env.WA_PHONE_NUMBER_ID;
  const token = env.WA_ACCESS_TOKEN;
  if (!phoneId || !token) throw new Error("WA_PHONE_NUMBER_ID / WA_ACCESS_TOKEN belum diatur");
  const versi = env.WA_API_VERSION || "v25.0";
  for (const bagian of splitPesan(teks)) {
    const res = await fetch(`https://graph.facebook.com/${versi}/${phoneId}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: bagian } }),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      throw new Error(`Kirim WhatsApp gagal (${res.status}): ${detail}`);
    }
  }
}
