import { NextRequest } from "next/server";
import { buatGroqClient } from "@/lib/ai";
import { tanganiPesan } from "@/lib/handler";
import { PgRepo } from "@/lib/pg-repo";
import { ekstrakPesan, kirimBalasan, maskNomor, verifySignature } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Batas tertinggi yang diminta; batas sebenarnya mengikuti paket Vercel (dicek dulu, SRS A4/NFR-03).
export const maxDuration = 30;

/** Verifikasi webhook (GET) saat mendaftarkan URL di konsol Meta. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const token = process.env.WA_VERIFY_TOKEN;
  if (token && sp.get("hub.mode") === "subscribe" && sp.get("hub.verify_token") === token) {
    return new Response(sp.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

/** Notifikasi pesan masuk (POST). */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const secret = process.env.WA_APP_SECRET;
  if (!secret || !verifySignature(raw, req.headers.get("x-hub-signature-256"), secret)) {
    return new Response("Unauthorized", { status: 401 }); // NFR-08
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const pesan = ekstrakPesan(payload); // notifikasi status (terkirim/dibaca) menghasilkan daftar kosong
  if (!pesan.length) return new Response("ok", { status: 200 });

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
      // Transaksi sudah di-rollback; 500 membuat Meta mengirim ulang dan pesan diproses ulang (tidak hilang).
      console.error(`Pemrosesan gagal untuk ${maskNomor(m.from)}: ${(e as Error).message}`);
      return new Response("Error", { status: 500 });
    }
  }
  return new Response("ok", { status: 200 });
}
