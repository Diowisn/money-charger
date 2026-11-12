import { aktorWeb, catatAudit } from "@/lib/audit";
import { AUTH_COOKIE, hashToken, normalisasiNomorWa, tolakJikaBelumLogin, userIdDariRequest } from "@/lib/auth";
import { kirimEmail } from "@/lib/email-out";
import { batasi, ipDariRequest } from "@/lib/rate-limit";
import { kirimBalasan } from "@/lib/whatsapp";
import { buatTokenReset, cabutSesi, cabutSemuaSesi, daftar, daftarSesi, masuk, pakaiTokenReset } from "./model";
import { loginBerhasil, loginGagal, logoutBerhasil } from "./view";

export async function login(req: Request) {
  const batas = batasi(`login:${ipDariRequest(req)}`, 5, 15 * 60_000);
  if (!batas.boleh) {
    return loginGagal(
      `Terlalu banyak percobaan login. Coba lagi dalam ${batas.detikTunggu} detik.`,
      429,
    );
  }

  let password = ""; let email = ""; let kode2fa = "";
  try {
    const body = (await req.json()) as { password?: unknown; email?: unknown; kode2fa?: unknown };
    password = typeof body?.password === "string" ? body.password : "";
    email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    kode2fa = typeof body?.kode2fa === "string" ? body.kode2fa.trim().toUpperCase().slice(0, 32) : "";
  } catch {
    password = "";
  }

  const ip = ipDariRequest(req);
  const hasil = await masuk(email, password, kode2fa);
  if (hasil.status === "2fa") {
    return Response.json({ ok: false, error: "Masukkan kode 2FA dari aplikasi authenticator.", perlu2fa: true }, { status: 401 });
  }
  if (hasil.status === "gagal") {
    await catatAudit(aktorWeb(ip), "login_gagal");
    await new Promise((resolve) => setTimeout(resolve, 350));
    return loginGagal("Password, kode 2FA, atau kode pemulihan salah.", 401);
  }
  await catatAudit(aktorWeb(ip), "login_berhasil");
  return loginBerhasil(hasil.token);
}

export async function register(req: Request) {
  const batas = batasi(`register:${ipDariRequest(req)}`, 5, 15 * 60_000);
  if (!batas.boleh) return loginGagal("Terlalu banyak percobaan. Coba lagi nanti.", 429);
  try {
    const body = await req.json() as { email?: unknown; password?: unknown; nama?: unknown; telepon?: unknown; tanggalLahir?: unknown };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12 || password.length > 1024) return loginGagal("Email tidak valid atau password kurang dari 12 karakter.", 400);
    const nama = typeof body.nama === "string" ? body.nama.trim() : "";
    if (nama.length > 60) return loginGagal("Nama maksimal 60 karakter.", 400);
    const telepon = typeof body.telepon === "string" ? body.telepon.trim() : "";
    if (telepon && !/^\+?[0-9][0-9\s-]{6,19}$/.test(telepon)) return loginGagal("Nomor telepon tidak valid.", 400);
    const tanggalLahir = typeof body.tanggalLahir === "string" ? body.tanggalLahir.trim() : "";
    if (tanggalLahir) {
      const hariIni = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
      const tanggal = new Date(`${tanggalLahir}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggalLahir) || Number.isNaN(tanggal.getTime()) || tanggal.toISOString().slice(0, 10) !== tanggalLahir || tanggalLahir > hariIni) {
        return loginGagal("Tanggal lahir tidak valid.", 400);
      }
    }
    const token = await daftar(email, password, { nama: nama || null, telepon: telepon || null, tanggalLahir: tanggalLahir || null });
    if (!token) return loginGagal("Email tersebut sudah terdaftar. Masuk dengan akun itu.", 409);
    return loginBerhasil(token);
  } catch { return loginGagal("Gagal membuat akun.", 500); }
}

export async function logout(req: Request) {
  await catatAudit(aktorWeb(ipDariRequest(req)), "logout");
  return logoutBerhasil();
}

export async function logoutSemua(req: import("next/server").NextRequest) {
  const tolak = await tolakJikaBelumLogin(req);
  if (tolak) return tolak;
  const userId = await userIdDariRequest(req);
  if (!userId) return loginGagal("Sesi habis. Silakan login ulang.", 401);
  try {
    await cabutSemuaSesi(userId);
    await catatAudit(aktorWeb(ipDariRequest(req)), "logout_semua_sesi");
    return logoutBerhasil();
  } catch {
    return loginGagal("Gagal mencabut sesi. Coba lagi.", 500);
  }
}

export async function getSesi(req: import("next/server").NextRequest) {
  const userId = await userIdDariRequest(req);
  if (!userId) return loginGagal("Sesi habis. Silakan login ulang.", 401);
  const token = req.cookies.get(AUTH_COOKIE)?.value;
  return Response.json({ ok: true, data: await daftarSesi(userId, token ? hashToken(token) : "") });
}

export async function deleteSesi(req: import("next/server").NextRequest) {
  const userId = await userIdDariRequest(req);
  if (!userId) return loginGagal("Sesi habis. Silakan login ulang.", 401);
  try {
    const body = (await req.json()) as { tokenHash?: unknown };
    const tokenHash = typeof body.tokenHash === "string" ? body.tokenHash : "";
    if (!tokenHash || !(await cabutSesi(userId, tokenHash))) {
      return loginGagal("Sesi tidak ditemukan.", 404);
    }
    await catatAudit(aktorWeb(ipDariRequest(req)), "sesi_dicabut");
    return Response.json({ ok: true, pesan: "Sesi dicabut." });
  } catch {
    return loginGagal("Gagal mencabut sesi.", 500);
  }
}

function asalReset(req: Request): string {
  const env = (process.env.AUTH_CALLBACK_BASE_URL || process.env.APP_BASE_URL || "").trim().replace(/\/$/, "");
  return env || new URL(req.url).origin;
}

function pesanReset(tautan: string): string {
  return [
    "Permintaan reset password Money-Charger.",
    "",
    "Buka tautan ini untuk membuat password baru (berlaku 30 menit, sekali pakai):",
    tautan,
    "",
    "Abaikan pesan ini jika kamu tidak memintanya.",
  ].join("\n");
}

export async function mintaReset(req: Request) {
  const batas = batasi(`forgot:${ipDariRequest(req)}`, 3, 15 * 60_000);
  if (!batas.boleh) return loginGagal(`Terlalu banyak permintaan. Coba lagi dalam ${batas.detikTunggu} detik.`, 429);

  let email = "";
  try {
    const body = (await req.json()) as { email?: unknown };
    email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  } catch {
    email = "";
  }

  const pesan = "Jika email terdaftar, tautan reset password sudah dikirim.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ ok: true, pesan });

  let tautan: string | undefined;
  try {
    const hasil = await buatTokenReset(email);
    if (hasil) {
      tautan = `${asalReset(req)}/reset?token=${encodeURIComponent(hasil.token)}`;
      const teks = pesanReset(tautan);
      let terkirim = await kirimEmail({
        to: email,
        subject: "Reset password Money-Charger",
        teks,
        html: `<p>Permintaan reset password Money-Charger.</p><p><a href="${tautan}">Buat password baru</a></p><p>Tautan berlaku 30 menit dan hanya bisa dipakai sekali. Abaikan email ini jika kamu tidak memintanya.</p>`,
      });
      if (!terkirim && hasil.telepon) {
        try {
          await kirimBalasan(normalisasiNomorWa(hasil.telepon), teks);
          terkirim = true;
        } catch {
          terkirim = false;
        }
      }
      if (!terkirim) console.warn("Reset password tidak terkirim: atur RESEND_API_KEY/EMAIL_FROM atau nomor WhatsApp akun.");
      await catatAudit(aktorWeb(ipDariRequest(req)), "reset_password_diminta");
    }
  } catch (e) {
    console.error(e);
  }

  const bolehTampil = tautan && process.env.NODE_ENV !== "production";
  return Response.json({ ok: true, pesan, ...(bolehTampil ? { tautan } : {}) });
}

export async function resetPassword(req: Request) {
  const batas = batasi(`reset:${ipDariRequest(req)}`, 5, 15 * 60_000);
  if (!batas.boleh) return loginGagal(`Terlalu banyak percobaan. Coba lagi dalam ${batas.detikTunggu} detik.`, 429);
  try {
    const body = (await req.json()) as { token?: unknown; password?: unknown };
    const token = typeof body.token === "string" ? body.token : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!token || token.length > 200) return loginGagal("Tautan reset tidak valid.", 400);
    if (password.length < 12 || password.length > 1024) return loginGagal("Password baru minimal 12 karakter.", 400);
    const berhasil = await pakaiTokenReset(token, password);
    if (!berhasil) return loginGagal("Tautan reset tidak valid atau sudah kedaluwarsa.", 400);
    await catatAudit(aktorWeb(ipDariRequest(req)), "reset_password_berhasil");
    return Response.json({ ok: true, pesan: "Password diperbarui. Silakan masuk dengan password baru." });
  } catch {
    return loginGagal("Gagal memperbarui password. Coba lagi.", 500);
  }
}
