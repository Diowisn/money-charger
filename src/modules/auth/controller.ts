import { batasi, ipDariRequest } from "@/lib/rate-limit";
import { masuk, sudahDikonfigurasi } from "./model";
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

  const token = masuk(password);
  if (!token) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    return loginGagal("Password salah.", 401);
  }
  return loginBerhasil(token);
}

export function logout() {
  return logoutBerhasil();
}
