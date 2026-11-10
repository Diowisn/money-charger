import type { NextRequest } from "next/server";
import { bacaBody, galat, ok } from "@/lib/api";
import { pemilikRequest, tolakPeran } from "@/lib/auth";
import { AksiError } from "@/lib/web-actions";
import { putusSheets, simpanSheets, sinkronSheets, statusSheets } from "./model";

export async function getSheets(req: NextRequest) {
  const auth = await pemilikRequest(req);
  if ("tolak" in auth) return auth.tolak;
  try {
    return ok({ data: await statusSheets(auth.userId) });
  } catch (e) {
    return galat(e);
  }
}

export async function postSheets(req: NextRequest) {
  const auth = await pemilikRequest(req);
  if ("tolak" in auth) return auth.tolak;
  const tolak = tolakPeran(auth, "kelola");
  if (tolak) return tolak;
  try {
    const body = await bacaBody(req);
    if (body.aksi === "simpan") {
      const data = await simpanSheets(auth.userId, body.url);
      return ok({ data, pesan: data.url ? "URL Google Sheets disimpan." : "Integrasi Google Sheets dimatikan." });
    }
    if (body.aksi === "sinkron") {
      const hasil = await sinkronSheets(auth.userId);
      return ok({ data: hasil, pesan: `${hasil.baris} transaksi dikirim ke Google Sheets.` });
    }
    if (body.aksi === "putus") {
      const data = await putusSheets(auth.userId);
      return ok({ data, pesan: "Koneksi Google Sheets diputuskan." });
    }
    throw new AksiError("Aksi Google Sheets tidak dikenal.");
  } catch (e) {
    return galat(e);
  }
}
