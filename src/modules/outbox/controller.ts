import type { NextRequest } from "next/server";
import { prosesAntreanOutbox } from "@/lib/outbox";
import { rahasiaCocok } from "@/lib/secret";
import { prosesDigest } from "@/modules/digest/model";
import { prosesTransaksiBerulang } from "@/modules/recurring/model";
import { prosesAntreanInbound } from "@/modules/whatsapp/queue";

export async function retryOutbox(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return Response.json({ ok: false, error: "CRON_SECRET belum diatur." }, { status: 503 });
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!rahasiaCocok(req.headers.get("x-cron-secret")?.trim() || bearer, secret)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const inbound = await prosesAntreanInbound();
    let otomatis: unknown = null;
    try {
      otomatis = await prosesTransaksiBerulang();
    } catch (error) {
      console.error(`Transaksi otomatis gagal: ${error instanceof Error ? error.message : "unknown"}`);
    }
    let digest: unknown = null;
    try {
      digest = await prosesDigest();
    } catch (error) {
      console.error(`Digest gagal: ${error instanceof Error ? error.message : "unknown"}`);
    }
    const outbox = await prosesAntreanOutbox();
    return Response.json({ ok: true, inbound, outbox, otomatis, digest }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error(`Outbox cron gagal: ${e instanceof Error ? e.message : "unknown error"}`);
    return Response.json({ ok: false, error: "Gagal memproses outbox." }, { status: 500 });
  }
}
