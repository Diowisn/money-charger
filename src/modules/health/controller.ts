import type { NextRequest } from "next/server";
import { rahasiaCocok } from "@/lib/secret";
import { periksaKesiapan, tokenHealth } from "./model";
import { responsHealth } from "./view";

export async function health(req: NextRequest) {
  const kunci = tokenHealth();
  const data = await periksaKesiapan();
  if (!kunci) {
    // Tanpa HEALTH_TOKEN jangan bocorkan nama env, host, atau jumlah data.
    return responsHealth({ ok: data.ok, waktu: data.waktu });
  }
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const kunciDikirim = req.headers.get("x-health-token")?.trim() || bearer;
  if (!rahasiaCocok(kunciDikirim, kunci)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return responsHealth(data);
}
