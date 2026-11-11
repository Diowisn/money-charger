import { NextResponse, type NextRequest } from "next/server";
import { pemilikRequest } from "@/lib/auth";
import { getPool } from "@/lib/pg-repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await pemilikRequest(req);
  if ("tolak" in auth) return auth.tolak;

  const dasar = process.env.GMAIL_SETUP_URL?.trim();
  if (!dasar) {
    return NextResponse.json({ ok: false, error: "GMAIL_SETUP_URL belum diatur di server." }, { status: 503 });
  }

  let url: URL;
  try {
    url = new URL(dasar);
  } catch {
    return NextResponse.json({ ok: false, error: "GMAIL_SETUP_URL tidak valid." }, { status: 503 });
  }

  const akun = await getPool().query<{ email: string }>("SELECT email FROM auth_users WHERE id = $1", [auth.userId]);
  url.searchParams.set("aksi", req.nextUrl.searchParams.get("aksi") === "jalankan" ? "jalankan" : "pasang");
  if (akun.rows[0]?.email) url.searchParams.set("akun", akun.rows[0].email);
  return NextResponse.redirect(url);
}
