import type { NextRequest } from "next/server";
import { bacaBody, galat, ok } from "@/lib/api";
import { pemilikRequest } from "@/lib/auth";
import { AksiError } from "@/lib/web-actions";
import { pindahAkunFinance, tambahAkunFinance } from "./model";

export async function postAkun(req: NextRequest) {
  const auth = await pemilikRequest(req);
  if ("tolak" in auth) return auth.tolak;
  try {
    const body = await bacaBody(req);
    const aksi = String(body.aksi ?? "");
    if (aksi === "tambah") {
      return ok(await tambahAkunFinance(body, auth.userId));
    }
    if (aksi === "pindah") {
      return ok(await pindahAkunFinance(body, auth.userId));
    }
    throw new AksiError("Aksi dompet tidak dikenal.");
  } catch (e) {
    return galat(e);
  }
}
