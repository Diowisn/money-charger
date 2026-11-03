import type { NextRequest } from "next/server";
import { bacaBody, galat, ok } from "@/lib/api";
import { tolakJikaBelumLogin } from "@/lib/auth";
import { wibDate } from "@/lib/parse/date";
import { PgRepo } from "@/lib/pg-repo";
import { simpanSetup } from "@/lib/web-actions";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const tolak = tolakJikaBelumLogin(req);
  if (tolak) return tolak;
  try {
    const body = await bacaBody(req);
    await simpanSetup(new PgRepo(), wibDate(Date.now()), {
      tanggalMulai: String(body.tanggalMulai ?? ""),
      saldoAwal: Number(body.saldoAwal ?? 0),
      tabunganAwal: Number(body.tabunganAwal ?? 0),
      investasiAwal: Number(body.investasiAwal ?? 0),
    });
    return ok();
  } catch (e) {
    return galat(e);
  }
}
