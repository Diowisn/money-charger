import { buatGroqClient } from "@/lib/ai";
import { tanganiPesan } from "@/lib/handler";
import { PgRepo } from "@/lib/pg-repo";
import { ekstrakPesan, kirimBalasan, maskNomor, verifySignature } from "@/lib/whatsapp";

export function tokenVerifikasi(): string | undefined {
  return process.env.WA_VERIFY_TOKEN;
}

export function verifikasiTandaTangan(raw: string, signature: string | null): boolean {
  const secret = process.env.WA_APP_SECRET;
  return Boolean(secret && verifySignature(raw, signature, secret));
}

export async function prosesPesanWebhook(raw: string): Promise<{ status: number; body: string }> {
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { status: 400, body: "Bad Request" };
  }

  const pesan = ekstrakPesan(payload);
  if (!pesan.length) return { status: 200, body: "ok" };

  const repo = new PgRepo();
  const deps = {
    ai: buatGroqClient(),
    baseUrl: process.env.APP_BASE_URL,
    log: (s: string) => console.warn(s),
  };

  for (const m of pesan) {
    try {
      const balasan = await tanganiPesan(repo, deps, m);
      if (balasan) {
        await kirimBalasan(m.from, balasan).catch((e: Error) =>
          console.error(`Balasan ke ${maskNomor(m.from)} gagal terkirim: ${e.message}`),
        );
      }
    } catch (e) {
      console.error(`Pemrosesan gagal untuk ${maskNomor(m.from)}: ${(e as Error).message}`);
      return { status: 500, body: "Error" };
    }
  }
  return { status: 200, body: "ok" };
}
