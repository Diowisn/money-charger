import type { NextRequest } from "next/server";
import { pemilikRequest, tolakPeran } from "@/lib/auth";
import { wibDate } from "@/lib/parse/date";
import { AksiError } from "@/lib/web-actions";
import { imporTransaksi } from "./model";

export async function postImport(req: NextRequest) {
  const auth = await pemilikRequest(req);
  if ("tolak" in auth) return auth.tolak;
  const tolak = tolakPeran(auth, "kelola");
  if (tolak) return tolak;
  try {
    const body = (await req.json()) as { csv?: unknown };
    const csv = typeof body.csv === "string" ? body.csv : "";
    if (!csv.trim()) throw new AksiError("Isi CSV belum ada.");
    if (csv.length > 2_000_000) throw new AksiError("CSV terlalu besar.");
    return Response.json({ ok: true, data: await imporTransaksi(auth.userId, csv, wibDate(Date.now())) });
  } catch (error) {
    const pesan = error instanceof AksiError ? error.message : "Gagal mengimpor CSV.";
    return Response.json({ ok: false, error: pesan }, { status: 400 });
  }
}
