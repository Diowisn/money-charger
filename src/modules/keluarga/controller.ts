import type { NextRequest } from "next/server";
import { bacaBody, galat, ok } from "@/lib/api";
import { pemilikRequest, tolakPeran } from "@/lib/auth";
import { AksiError } from "@/lib/web-actions";
import { daftarKeluarga, hapusAnggota, setujuiTransaksi, tambahAnggota, tolakTransaksi, ubahPeran } from "./model";

export async function getKeluarga(req: NextRequest) {
  const auth = await pemilikRequest(req);
  if ("tolak" in auth) return auth.tolak;
  try {
    return ok({ ...(await daftarKeluarga(auth.userId)), peran: auth.role });
  } catch (e) {
    return galat(e);
  }
}

export async function postKeluarga(req: NextRequest) {
  const auth = await pemilikRequest(req);
  if ("tolak" in auth) return auth.tolak;
  const tolak = tolakPeran(auth, "kelola");
  if (tolak) return tolak;
  try {
    const body = await bacaBody(req);
    const aksi = String(body.aksi ?? "");
    if (aksi === "tambah") await tambahAnggota(auth.userId, body.email, body.role, body.wa);
    else if (aksi === "peran") await ubahPeran(auth.userId, Number(body.id), body.role);
    else if (aksi === "hapus") await hapusAnggota(auth.userId, Number(body.id));
    else if (aksi === "setujui") await setujuiTransaksi(auth.userId, Number(body.id));
    else if (aksi === "tolak") await tolakTransaksi(auth.userId, Number(body.id));
    else throw new AksiError("Aksi keluarga tidak dikenal.");
    return ok({ pesan: "Data keluarga diperbarui." });
  } catch (e) {
    return galat(e);
  }
}
