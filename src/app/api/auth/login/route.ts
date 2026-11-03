import { NextResponse } from "next/server";
import { AUTH_COOKIE, authDikonfigurasi, buatToken, cocokkanPassword, opsiCookie } from "@/lib/auth";

export async function POST(req: Request) {
  if (!authDikonfigurasi()) {
    return NextResponse.json(
      { ok: false, error: "DASHBOARD_PASSWORD belum diatur di server." },
      { status: 503 },
    );
  }

  let password = "";
  try {
    const body = (await req.json()) as { password?: unknown };
    password = typeof body?.password === "string" ? body.password : "";
  } catch {
    password = "";
  }

  if (!cocokkanPassword(password)) {
    await new Promise((r) => setTimeout(r, 350));
    return NextResponse.json({ ok: false, error: "Password salah." }, { status: 401 });
  }

  const token = buatToken();
  if (!token) {
    return NextResponse.json({ ok: false, error: "Konfigurasi auth tidak lengkap." }, { status: 503 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, token, opsiCookie());
  return res;
}
