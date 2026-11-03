import type { NextRequest } from "next/server";
import { bacaBody, galat, ok } from "@/lib/api";
import { tolakJikaBelumLogin } from "@/lib/auth";
import { wibDate } from "@/lib/parse/date";
import { PgRepo } from "@/lib/pg-repo";
import { AksiError, simpanRencana, type ItemRencana } from "@/lib/web-actions";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const tolak = tolakJikaBelumLogin(req);
  if (tolak) return tolak;
  try {
    const body = await bacaBody(req);
    const items = Array.isArray(body.items) ? (body.items as ItemRencana[]) : [];
    if (!items.length) throw new AksiError("Rencana kosong.");
    const hasil = await simpanRencana(new PgRepo(), wibDate(Date.now()), items, body.sekarang === true);
    return ok(hasil);
  } catch (e) {
    return galat(e);
  }
}
