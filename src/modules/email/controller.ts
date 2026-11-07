import type { NextRequest } from "next/server";
import { emailDikonfigurasi, prosesEmailMasuk, verifikasiRahasiaEmail, type EmailMasuk } from "./model";
import { emailGagal, emailOk } from "./view";

export async function terimaEmail(req: NextRequest) {
  if (!emailDikonfigurasi()) {
    return emailGagal("EMAIL_INBOUND_SECRET belum diatur di server.", 503);
  }
  // Hanya lewat header: secret di query string mudah bocor ke log/proxy.
  const header = req.headers.get("x-email-secret");
  if (!verifikasiRahasiaEmail(header)) {
    return emailGagal("Rahasia email tidak cocok.", 401);
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return emailGagal("Body harus JSON.", 400);
  }

  const teks = typeof body.text === "string" && body.text.trim() ? body.text : undefined;
  const input: EmailMasuk = {
    id: String(body.id ?? body.messageId ?? ""),
    dari: typeof body.from === "string" ? body.from : undefined,
    subjek: typeof body.subject === "string" ? body.subject : undefined,
    teks: teks ?? (typeof body.html === "string" ? body.html : undefined),
    akun: typeof body.akun === "string" ? body.akun : undefined,
    nominal: typeof body.nominal === "number" ? body.nominal : undefined,
    tanggal: typeof body.tanggal === "string" ? body.tanggal : undefined,
  };

  try {
    const hasil = await prosesEmailMasuk(input);
    return emailOk(hasil.pesan, hasil.dicatat);
  } catch (e) {
    console.error(e);
    return emailGagal(e instanceof Error ? e.message : "Gagal memproses email.", 400);
  }
}
