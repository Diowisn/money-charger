import type { NextRequest } from "next/server";
import { galat, ok } from "@/lib/api";
import { pemilikRequest } from "@/lib/auth";
import { buatKalender, tokenKalender, userDariTokenKalender } from "./model";
import { unduhanIcs } from "./view";

export async function getKalender(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")?.trim();
  try {
    if (token) {
      const userId = await userDariTokenKalender(token);
      if (!userId) return Response.json({ ok: false, error: "Token kalender tidak valid." }, { status: 401 });
      return unduhanIcs(await buatKalender(userId));
    }
    const auth = await pemilikRequest(req);
    if ("tolak" in auth) return auth.tolak;
    return unduhanIcs(await buatKalender(auth.userId));
  } catch (e) {
    return galat(e);
  }
}

/** Mengembalikan URL langganan kalender dengan token feed milik pemilik. */
export async function postKalender(req: NextRequest) {
  const auth = await pemilikRequest(req);
  if ("tolak" in auth) return auth.tolak;
  try {
    const token = await tokenKalender(auth.userId);
    return ok({ data: { url: `/api/kalender?token=${token}` } });
  } catch (e) {
    return galat(e);
  }
}
