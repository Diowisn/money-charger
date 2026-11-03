import type { NextRequest } from "next/server";
import { bacaBody, galat, ok } from "@/lib/api";
import { tolakJikaBelumLogin } from "@/lib/auth";
import { PgRepo } from "@/lib/pg-repo";
import { AksiError, gantiNamaPos, nonaktifkanPos, tambahAliasPos, tambahPos } from "@/lib/web-actions";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const tolak = tolakJikaBelumLogin(req);
  if (tolak) return tolak;
  try {
    const body = await bacaBody(req);
    const repo = new PgRepo();
    const id = Number(body.id);

    switch (String(body.aksi ?? "")) {
      case "tambah": {
        const hasil = await tambahPos(repo, {
          groupId: Number(body.groupId),
          nama: String(body.nama ?? ""),
          jatah: Number(body.jatah ?? 0),
        });
        return ok(hasil);
      }
      case "ganti_nama": {
        await gantiNamaPos(repo, id, String(body.nama ?? ""));
        return ok();
      }
      case "alias": {
        await tambahAliasPos(repo, id, String(body.alias ?? ""));
        return ok();
      }
      case "nonaktif": {
        await nonaktifkanPos(repo, id);
        return ok();
      }
      default:
        throw new AksiError("Aksi pos tidak dikenal.");
    }
  } catch (e) {
    return galat(e);
  }
}
