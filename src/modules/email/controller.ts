import type { NextRequest } from "next/server";
import { emailDikonfigurasi, prosesEmailMasuk, verifikasiRahasiaEmail, type EmailMasuk } from "./model";
import { emailGagal, emailOk } from "./view";

export async function terimaEmail(req: NextRequest) {
  if (!emailDikonfigurasi()) {
    return emailGagal("EMAIL_INBOUND_SECRET belum diatur di server.", 503);
  }
  const header = req.headers.get("x-email-secret");
  const query = req.nextUrl.searchParams.get("secret");
  if (!verifikasiRahasiaEmail(header ?? query)) {
    return emailGagal("Rahasia email tidak cocok.", 401);
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return emailGagal("Body harus JSON.", 400);
  }

  const input: EmailMasuk = {
    id: String(body.id ?? body.messageId ?? ""),
    dari: typeof body.from === "string" ? body.from : undefined,
    subjek: typeof body.subject === "string" ? body.subject : undefined,
    teks: typeof body.text === "string" ? body.text : typeof body.html === "string" ? body.html : undefined,
    nominal: typeof body.nominal === "number" ? body.nominal : undefined,
  };

  try {
    const hasil = await prosesEmailMasuk(input);
    return emailOk(hasil.pesan, hasil.dicatat);
  } catch (e) {
    console.error(e);
    return emailGagal(e instanceof Error ? e.message : "Gagal memproses email.", 400);
  }
}
