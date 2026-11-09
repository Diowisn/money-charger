import type { NextRequest } from "next/server";
import { pemilikRequest } from "@/lib/auth";
import { AksiError } from "@/lib/web-actions";
import { tambahAturan, hapusAturan, ubahStatusAturan } from "./model";

export async function postRecurring(req: NextRequest) {
  const auth = await pemilikRequest(req);
  if ("tolak" in auth) return auth.tolak;
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const aksi = String(body.aksi ?? "");
    if (aksi === "tambah") {
      return Response.json({ ok: true, data: await tambahAturan(auth.userId, body) });
    }
    if (aksi === "status") {
      await ubahStatusAturan(auth.userId, Number(body.id), body.aktif === true);
      return Response.json({ ok: true });
    }
    if (aksi === "hapus") {
      await hapusAturan(auth.userId, Number(body.id));
      return Response.json({ ok: true });
    }
    throw new AksiError("Aksi otomatis tidak dikenal.");
  } catch (error) {
    const pesan = error instanceof AksiError ? error.message : "Gagal menyimpan aturan otomatis.";
    return Response.json({ ok: false, error: pesan }, { status: 400 });
  }
}
