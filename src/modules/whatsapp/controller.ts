import type { NextRequest } from "next/server";
import { prosesPesanWebhook, tokenVerifikasi, verifikasiTandaTangan } from "./model";
import { responsWebhook } from "./view";

export async function verifikasiWebhook(req: NextRequest) {
  const search = req.nextUrl.searchParams;
  const token = tokenVerifikasi();
  if (token && search.get("hub.mode") === "subscribe" && search.get("hub.verify_token") === token) {
    return responsWebhook(200, search.get("hub.challenge") ?? "");
  }
  return responsWebhook(403, "Forbidden");
}

export async function terimaWebhook(req: NextRequest) {
  const raw = await req.text();
  if (!verifikasiTandaTangan(raw, req.headers.get("x-hub-signature-256"))) {
    return responsWebhook(401, "Unauthorized");
  }
  const hasil = await prosesPesanWebhook(raw);
  return responsWebhook(hasil.status, hasil.body);
}
