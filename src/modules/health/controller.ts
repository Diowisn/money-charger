import type { NextRequest } from "next/server";
import { periksaKesiapan, tokenHealth } from "./model";
import { responsHealth } from "./view";

export async function health(req: NextRequest) {
  const kunci = tokenHealth();
  if (kunci && req.nextUrl.searchParams.get("token") !== kunci) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return responsHealth(await periksaKesiapan());
}
