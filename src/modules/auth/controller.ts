import { aktorWeb, catatAudit } from "@/lib/audit";
import { tolakJikaBelumLogin, userIdDariRequest } from "@/lib/auth";
import { batasi, ipDariRequest } from "@/lib/rate-limit";
import { cabutSemuaSesi, daftar, masuk } from "./model";
import { loginBerhasil, loginGagal, logoutBerhasil } from "./view";

export async function login(req: Request) {
  const batas = batasi(`login:${ipDariRequest(req)}`, 5, 15 * 60_000);
  if (!batas.boleh) {
    return loginGagal(
      `Terlalu banyak percobaan login. Coba lagi dalam ${batas.detikTunggu} detik.`,
      429,
    );
  }

  let password = ""; let email = "";
  try {
    const body = (await req.json()) as { password?: unknown; email?: unknown };
    password = typeof body?.password === "string" ? body.password : "";
    email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  } catch {
    password = "";
  }

  const ip = ipDariRequest(req);
  const token = await masuk(email, password);
  if (!token) {
    await catatAudit(aktorWeb(ip), "login_gagal");
    await new Promise((resolve) => setTimeout(resolve, 350));
    return loginGagal("Password salah atau database sesi tidak tersedia.", 401);
  }
  await catatAudit(aktorWeb(ip), "login_berhasil");
  return loginBerhasil(token);
}

export async function register(req: Request) {
  const batas = batasi(`register:${ipDariRequest(req)}`, 5, 15 * 60_000);
  if (!batas.boleh) return loginGagal("Terlalu banyak percobaan. Coba lagi nanti.", 429);
  try {
    const body = await req.json() as { email?: unknown; password?: unknown };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12 || password.length > 1024) return loginGagal("Email tidak valid atau password kurang dari 12 karakter.", 400);
    const token = await daftar(email, password);
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
