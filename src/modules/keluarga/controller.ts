import type { NextRequest } from "next/server";
import { pemilikRequest } from "@/lib/auth";

const PESAN = "Berbagi data lintas akun sudah dinonaktifkan. Setiap akun hanya bisa melihat transaksinya sendiri.";

export async function getKeluarga(req: NextRequest) {
  const auth = await pemilikRequest(req);
  if ("tolak" in auth) return auth.tolak;
  return Response.json({ ok: false, error: PESAN }, { status: 410 });
}

export async function postKeluarga(req: NextRequest) {
  const auth = await pemilikRequest(req);
  if ("tolak" in auth) return auth.tolak;
  return Response.json({ ok: false, error: PESAN }, { status: 410 });
}
