import { buatGroqClient } from "@/lib/ai";
import { buatGroqVisionClient } from "@/lib/ai-vision";
import { antreInbound } from "@/lib/inbound-queue";
import { ekstrakPesan, unduhMediaWhatsapp, verifySignature } from "@/lib/whatsapp";
import type { Deps } from "./handler";

export function tokenVerifikasi(): string | undefined {
  return process.env.WA_VERIFY_TOKEN;
}

export function verifikasiTandaTangan(raw: string, signature: string | null): boolean {
  const secret = process.env.WA_APP_SECRET;
  return Boolean(secret && verifySignature(raw, signature, secret));
}

export function buatDeps(): Deps {
  return {
    ai: buatGroqClient(),
    vision: buatGroqVisionClient(),
    unduhMedia: (mediaId: string) => unduhMediaWhatsapp(mediaId),
    baseUrl: process.env.APP_BASE_URL,
    log: (s: string) => console.warn(s),
  };
}

export async function prosesPesanWebhook(
  raw: string,
): Promise<{ status: number; body: string; adaJob: boolean }> {
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { status: 400, body: "Bad Request", adaJob: false };
  }

  const pesan = ekstrakPesan(payload);
  if (pesan.length > 50) return { status: 413, body: "Too many events", adaJob: false };
  if (!pesan.length) return { status: 200, body: "ok", adaJob: false };

  const jumlah = await antreInbound(pesan);
  return { status: 200, body: "ok", adaJob: jumlah > 0 };
}
