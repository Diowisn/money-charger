import type { NextRequest } from "next/server";
import { pemilikRequest } from "@/lib/auth";
import { buatEkspor } from "./model";
import { eksporTidakDitemukan, unduhanCsv } from "./view";

export async function unduhEkspor(req: NextRequest) {
  const auth = await pemilikRequest(req);
  if ("tolak" in auth) return auth.tolak;
  const csv = await buatEkspor(req.nextUrl.searchParams.get("t") ?? "", auth.userId);
  return csv === null ? eksporTidakDitemukan() : unduhanCsv(csv);
}
