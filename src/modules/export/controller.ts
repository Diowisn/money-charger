import type { NextRequest } from "next/server";
import { buatEkspor } from "./model";
import { eksporTidakDitemukan, unduhanCsv } from "./view";

export async function unduhEkspor(req: NextRequest) {
  const csv = await buatEkspor(req.nextUrl.searchParams.get("t") ?? "");
  return csv === null ? eksporTidakDitemukan() : unduhanCsv(csv);
}
