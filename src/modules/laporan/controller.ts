import type { NextRequest } from "next/server";
import { galat, ok } from "@/lib/api";
import { pemilikRequest } from "@/lib/auth";
import { buatLaporan } from "./model";

export async function getLaporan(req: NextRequest) {
  const auth = await pemilikRequest(req);
  if ("tolak" in auth) return auth.tolak;
  try {
    const sp = req.nextUrl.searchParams;
    return ok({ data: await buatLaporan(auth.userId, sp.get("dari"), sp.get("sampai")) });
  } catch (e) {
    return galat(e);
  }
}
