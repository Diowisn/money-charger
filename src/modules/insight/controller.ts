import type { NextRequest } from "next/server";
import { tolakJikaBelumLogin, userIdDariRequest } from "@/lib/auth";
import { bacaBody } from "@/lib/api";
import { batasi, ipDariRequest } from "@/lib/rate-limit";
import { galat, ok } from "./view";
import { tanyaInsight } from "./model";

export async function postInsight(req: NextRequest) {
  const tolak = await tolakJikaBelumLogin(req);
  if (tolak) return tolak;
  const userId = await userIdDariRequest(req);
  if (!userId) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const batas = batasi(`insight:${ipDariRequest(req)}`, 10, 60_000);
  if (!batas.boleh) {
    return Response.json(
      { ok: false, error: `Terlalu banyak permintaan AI. Coba lagi dalam ${batas.detikTunggu} detik.` },
      { status: 429, headers: { "Retry-After": String(batas.detikTunggu) } },
    );
  }
  try {
    const body = await bacaBody(req);
    const hasil = await tanyaInsight(body.pertanyaan, userId);
    return ok({ jawaban: hasil.jawaban, pertanyaan: hasil.pertanyaan });
  } catch (e) {
    return galat(e);
  }
}
