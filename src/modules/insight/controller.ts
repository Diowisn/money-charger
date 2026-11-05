import type { NextRequest } from "next/server";
import { tolakJikaBelumLogin } from "@/lib/auth";
import { bacaBody } from "@/lib/api";
import { galat, ok } from "./view";
import { tanyaInsight } from "./model";

export async function postInsight(req: NextRequest) {
  const tolak = tolakJikaBelumLogin(req);
  if (tolak) return tolak;
  try {
    const body = await bacaBody(req);
    const hasil = await tanyaInsight(body.pertanyaan);
    return ok({ jawaban: hasil.jawaban, pertanyaan: hasil.pertanyaan });
  } catch (e) {
    return galat(e);
  }
}
