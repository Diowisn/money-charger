import { aktorWeb, catatAudit } from "@/lib/audit";
import { tolakJikaBelumLogin } from "@/lib/auth";
import { batasi, ipDariRequest } from "@/lib/rate-limit";
import { cabutSemuaSesi, masuk, sudahDikonfigurasi } from "./model";
import { loginBerhasil, loginGagal, logoutBerhasil } from "./view";

export async function login(req: Request) {
  if (!sudahDikonfigurasi()) {
    return loginGagal("DASHBOARD_PASSWORD belum diatur di server.", 503);
  }

  const batas = batasi(`login:${ipDariRequest(req)}`, 5, 15 * 60_000);
  if (!batas.boleh) {
    return loginGagal(
      `Terlalu banyak percobaan login. Coba lagi dalam ${batas.detikTunggu} detik.`,
      429,
    );
  }

  let password = "";
  try {
    const body = (await req.json()) as { password?: unknown };
    password = typeof body?.password === "string" ? body.password : "";
  } catch {
    password = "";
  }

  const ip = ipDariRequest(req);
  const token = await masuk(password);
  if (!token) {
    await catatAudit(aktorWeb(ip), "login_gagal");
    await new Promise((resolve) => setTimeout(resolve, 350));
    return loginGagal("Password salah atau database sesi tidak tersedia.", 401);
  }
  await catatAudit(aktorWeb(ip), "login_berhasil");
  return loginBerhasil(token);
}

export async function logout(req: Request) {
  await catatAudit(aktorWeb(ipDariRequest(req)), "logout");
  return logoutBerhasil();
}

export async function logoutSemua(req: import("next/server").NextRequest) {
  const tolak = await tolakJikaBelumLogin(req);
  if (tolak) return tolak;
  try {
    await cabutSemuaSesi();
    await catatAudit(aktorWeb(ipDariRequest(req)), "logout_semua_sesi");
    return logoutBerhasil();
  } catch {
    return loginGagal("Gagal mencabut sesi. Coba lagi.", 500);
  }
}
