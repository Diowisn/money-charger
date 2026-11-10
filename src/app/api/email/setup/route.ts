import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
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

  url.searchParams.set("aksi", req.nextUrl.searchParams.get("aksi") === "jalankan" ? "jalankan" : "pasang");
  return NextResponse.redirect(url);
}
