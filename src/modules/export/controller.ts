import type { NextRequest } from "next/server";
import { pemilikRequest } from "@/lib/auth";
import { buatEkspor, buatEksporTerenkripsi } from "./model";
import { eksporTidakDitemukan, unduhanCsv, unduhanTerenkripsi } from "./view";

export async function unduhEkspor(req: NextRequest) {
  const auth = await pemilikRequest(req);
  if ("tolak" in auth) return auth.tolak;
  const csv = await buatEkspor(req.nextUrl.searchParams.get("t") ?? "", auth.userId);
  return csv === null ? eksporTidakDitemukan() : unduhanCsv(csv);
}

export async function unduhEksporTerenkripsi(req: NextRequest) {
  const auth = await pemilikRequest(req);
  if ("tolak" in auth) return auth.tolak;
  try {
    const body = (await req.json()) as { password?: unknown };
    const password = typeof body.password === "string" ? body.password : "";
    return unduhanTerenkripsi(await buatEksporTerenkripsi(auth.userId, password));
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "Gagal membuat ekspor." }, { status: 400 });
  }
}
