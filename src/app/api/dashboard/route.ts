import type { NextRequest } from "next/server";
import { tolakJikaBelumLogin } from "@/lib/auth";
import { bangunDashboard } from "@/lib/dashboard";
import { wibDate } from "@/lib/parse/date";
import { PgRepo } from "@/lib/pg-repo";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const tolak = tolakJikaBelumLogin(req);
  if (tolak) return tolak;
  try {
    const state = await new PgRepo().load();
    return Response.json(
      { ok: true, data: bangunDashboard(state, wibDate(Date.now())) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error(e);
    return Response.json({ ok: false, error: "Gagal memuat data." }, { status: 500 });
  }
}
