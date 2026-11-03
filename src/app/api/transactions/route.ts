import type { NextRequest } from "next/server";
import { bacaBody, galat, ok } from "@/lib/api";
import { tolakJikaBelumLogin } from "@/lib/auth";
import { wibDate } from "@/lib/parse/date";
import { PgRepo } from "@/lib/pg-repo";
import { batalkanTransaksi, tambahTransaksi, type InputTransaksi } from "@/lib/web-actions";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const tolak = tolakJikaBelumLogin(req);
  if (tolak) return tolak;
  try {
    const body = await bacaBody(req);
    const hasil = await tambahTransaksi(new PgRepo(), wibDate(Date.now()), body as unknown as InputTransaksi);
    return ok(hasil);
  } catch (e) {
    return galat(e);
  }
}

export async function DELETE(req: NextRequest) {
  const tolak = tolakJikaBelumLogin(req);
  if (tolak) return tolak;
  try {
    const body = await bacaBody(req);
    const id = Number(body.id);
    const pesan = await batalkanTransaksi(new PgRepo(), id);
    return ok({ pesan });
  } catch (e) {
    return galat(e);
  }
}
