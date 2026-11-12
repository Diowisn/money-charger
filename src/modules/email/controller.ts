import type { NextRequest } from "next/server";
import { emailDikonfigurasi, pratinjauEmail, prosesEmailMasuk, tautkanEmailAkun, verifikasiRahasiaEmail, type EmailMasuk } from "./model";
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
    dompet: typeof body.dompet === "string" ? body.dompet : typeof body.wallet === "string" ? body.wallet : undefined,
    penyedia: typeof body.penyedia === "string" ? body.penyedia : typeof body.provider === "string" ? body.provider : undefined,
  };

  const kering =
    req.nextUrl.searchParams.get("dryRun") === "1" ||
    req.headers.get("x-email-dry-run") === "1";

  try {
    if (kering) {
      return Response.json({ ok: true, dicatat: false, pratinjau: await pratinjauEmail(input) });
    }
    const hasil = await prosesEmailMasuk(input);
    return emailOk(hasil.pesan, hasil.dicatat);
  } catch (e) {
    console.error(e);
    return emailGagal(e instanceof Error ? e.message : "Gagal memproses email.", 400);
  }
}

/** Dipanggil Apps Script setelah trigger Gmail milik pengguna terpasang. */
export async function tautkanEmail(req: NextRequest) {
  if (!emailDikonfigurasi()) {
    return emailGagal("EMAIL_INBOUND_SECRET belum diatur di server.", 503);
  }
  if (!verifikasiRahasiaEmail(req.headers.get("x-email-secret"))) {
    return emailGagal("Rahasia email tidak cocok.", 401);
  }
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return emailGagal("Body harus JSON.", 400);
  }
  try {
    const hasil = await tautkanEmailAkun(body.akun);
    if (!hasil) return emailGagal("Email Gmail tidak cocok dengan akun Money-Charger mana pun.", 404);
    return emailOk(`Gmail ${hasil.email} tertaut ke akun Money-Charger.`, true);
  } catch (e) {
    return emailGagal(e instanceof Error ? e.message : "Gagal menautkan email.", 400);
  }
}
