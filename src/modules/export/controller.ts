import type { NextRequest } from "next/server";
import { tolakJikaBelumLogin, userIdDariRequest } from "@/lib/auth";
import { buatEkspor } from "./model";
import { eksporTidakDitemukan, unduhanCsv } from "./view";

export async function unduhEkspor(req: NextRequest) {
  const tolak = await tolakJikaBelumLogin(req);
  if (tolak) return tolak;
  const userId = await userIdDariRequest(req);
  if (!userId) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const csv = await buatEkspor(req.nextUrl.searchParams.get("t") ?? "", userId);
  return csv === null ? eksporTidakDitemukan() : unduhanCsv(csv);
}
