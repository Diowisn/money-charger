import { after, type NextRequest } from "next/server";
import { batasi, ipDariRequest } from "@/lib/rate-limit";
import { prosesPesanWebhook, tokenVerifikasi, verifikasiTandaTangan } from "./model";
import { prosesAntreanInbound } from "./queue";
import { responsWebhook } from "./view";

export async function verifikasiWebhook(req: NextRequest) {
  const search = req.nextUrl.searchParams;
  const token = tokenVerifikasi();
  if (token && search.get("hub.mode") === "subscribe" && search.get("hub.verify_token") === token) {
    return responsWebhook(200, search.get("hub.challenge") ?? "");
  }
  return responsWebhook(403, "Forbidden");
}

const MAKS_BODY = 1024 * 1024;

async function bacaBodyTerbatas(req: Request): Promise<string | null> {
  const reader = req.body?.getReader();
  if (!reader) return "";
  const bagian: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAKS_BODY) {
      await reader.cancel();
      return null;
    }
    bagian.push(value);
  }
  const gabung = new Uint8Array(total);
  let offset = 0;
  for (const b of bagian) {
    gabung.set(b, offset);
    offset += b.byteLength;
  }
  return new TextDecoder().decode(gabung);
}

export async function terimaWebhook(req: NextRequest) {
  const batas = batasi(`webhook:${ipDariRequest(req)}`, 120, 60_000);
  if (!batas.boleh) {
    return responsWebhook(429, "Too Many Requests");
  }
  const raw = await bacaBodyTerbatas(req);
  if (raw === null) return responsWebhook(413, "Payload Too Large");
  if (!verifikasiTandaTangan(raw, req.headers.get("x-hub-signature-256"))) {
    return responsWebhook(401, "Unauthorized");
  }
  const hasil = await prosesPesanWebhook(raw);
  if (hasil.adaJob) {
    after(async () => {
      try {
        await prosesAntreanInbound(50);
      } catch {
        console.error("Worker inbound gagal; job tetap tersimpan untuk retry.");
      }
    });
  }
  return responsWebhook(hasil.status, hasil.body);
}
