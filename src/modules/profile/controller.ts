import type { NextRequest } from "next/server";
import { bacaBody, galat, ok } from "@/lib/api";
import { userIdDariRequest } from "@/lib/auth";
import { AksiError } from "@/lib/web-actions";
import { logoutBerhasil } from "@/modules/auth/view";
import { jumlahKodePemulihan } from "@/modules/auth/model";
import { aktifkan2fa, ambilProfil, gantiKodePemulihan, gantiPassword, hapusAkun, matikan2fa, mulai2fa, ubahProfil } from "./model";

async function userId(req: NextRequest): Promise<string | Response> {
  const id = await userIdDariRequest(req);
  if (!id) return Response.json({ ok: false, error: "Sesi habis. Silakan login ulang." }, { status: 401 });
  return id;
}

export async function getProfil(req: NextRequest) {
  const id = await userId(req);
  if (id instanceof Response) return id;
  try {
    const profil = await ambilProfil(id);
    if (!profil) return Response.json({ ok: false, error: "Akun tidak ditemukan." }, { status: 404 });
    return ok({ profil });
  } catch (e) {
    return galat(e);
  }
}

export async function patchProfil(req: NextRequest) {
  const id = await userId(req);
  if (id instanceof Response) return id;
  try {
    const body = await bacaBody(req);
    const patch: { nama?: string; email?: string; telepon?: string | null; tanggalLahir?: string | null; avatar?: string | null } = {};

    if (body.nama !== undefined) {
      const nama = String(body.nama).trim();
      if (!nama || nama.length > 60) throw new AksiError("Nama harus 1 sampai 60 karakter.");
      patch.nama = nama;
    }
    if (body.email !== undefined) {
      const email = String(body.email).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new AksiError("Alamat email tidak valid.");
      patch.email = email;
    }
    if (body.telepon !== undefined) {
      const raw = String(body.telepon ?? "").trim();
      if (!raw) {
        patch.telepon = null;
      } else {
        if (!/^\+?[0-9][0-9\s-]{6,19}$/.test(raw)) throw new AksiError("Nomor telepon tidak valid.");
        patch.telepon = raw;
      }
    }
    if (body.tanggalLahir !== undefined) {
      const raw = String(body.tanggalLahir ?? "").trim();
      if (!raw) {
        patch.tanggalLahir = null;
      } else {
        const hariIni = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
        const tanggal = new Date(`${raw}T00:00:00Z`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(tanggal.getTime()) || tanggal.toISOString().slice(0, 10) !== raw || raw > hariIni) {
          throw new AksiError("Tanggal lahir tidak valid.");
        }
        patch.tanggalLahir = raw;
      }
    }
    if (body.avatar !== undefined) {
      if (body.avatar === null || body.avatar === "") {
        patch.avatar = null;
      } else {
        const avatar = String(body.avatar);
        if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(avatar) || avatar.length > 512_000) {
          throw new AksiError("Foto profil tidak valid atau terlalu besar.");
        }
        patch.avatar = avatar;
      }
    }

    if (body.newPassword !== undefined) {
      const passwordBaru = String(body.newPassword);
      const passwordLama = typeof body.currentPassword === "string" ? body.currentPassword : "";
      if (passwordBaru.length < 12 || passwordBaru.length > 1024) throw new AksiError("Password baru minimal 12 karakter.");
      const berhasil = await gantiPassword(id, passwordLama, passwordBaru);
      if (!berhasil) throw new AksiError("Password lama tidak cocok.");
    }

    if (Object.keys(patch).length) {
      const profil = await ubahProfil(id, patch);
      if (!profil) return Response.json({ ok: false, error: "Akun tidak ditemukan." }, { status: 404 });
      return ok({ profil, pesan: "Profil diperbarui." });
    }
    if (body.newPassword !== undefined) {
      return ok({ profil: await ambilProfil(id), pesan: "Password diperbarui." });
    }
    throw new AksiError("Tidak ada perubahan.");
  } catch (e) {
    return galat(e);
  }
}

export async function get2fa(req: NextRequest) {
  const id = await userId(req);
  if (id instanceof Response) return id;
  try {
    const profil = await ambilProfil(id);
    if (!profil) return Response.json({ ok: false, error: "Akun tidak ditemukan." }, { status: 404 });
    return ok({ aktif: profil.duaFaktorAktif, sisaKodePemulihan: await jumlahKodePemulihan(id) });
  } catch (e) {
    return galat(e);
  }
}

export async function post2fa(req: NextRequest) {
  const id = await userId(req);
  if (id instanceof Response) return id;
  try {
    const body = await bacaBody(req);
    const aksi = String(body.aksi ?? "");
    if (aksi === "mulai") {
      const profil = await ambilProfil(id);
      if (!profil) throw new AksiError("Akun tidak ditemukan.");
      return ok(await mulai2fa(id, profil.email));
    }
    if (aksi === "aktifkan") {
      const kode = String(body.kode ?? "").replace(/\D/g, "").slice(0, 6);
      const kodePemulihan = await aktifkan2fa(id, kode);
      if (!kodePemulihan) throw new AksiError("Kode 2FA tidak cocok.");
      return ok({ pesan: "2FA aktif. Simpan kode pemulihan sekarang.", kodePemulihan });
    }
    if (aksi === "kode-pemulihan") {
      if (!(await ambilProfil(id))?.duaFaktorAktif) throw new AksiError("Aktifkan 2FA dulu.");
      return ok({ pesan: "Kode pemulihan baru dibuat; kode lama tidak berlaku.", kodePemulihan: await gantiKodePemulihan(id) });
    }
    if (aksi === "matikan") {
      if (!(await matikan2fa(id, String(body.password ?? "")))) throw new AksiError("Password tidak cocok.");
      return ok({ pesan: "2FA dimatikan." });
    }
    throw new AksiError("Aksi 2FA tidak dikenal.");
  } catch (e) {
    return galat(e);
  }
}

export async function deleteProfil(req: NextRequest) {
  const id = await userId(req);
  if (id instanceof Response) return id;
  try {
    const body = await bacaBody(req);
    const email = String(body.email ?? "").trim();
    const password = typeof body.password === "string" ? body.password : "";
    if (!email) throw new AksiError("Ketik email akun untuk konfirmasi.");
    const berhasil = await hapusAkun(id, email, password);
    if (!berhasil) throw new AksiError("Email atau password tidak cocok.");
    return logoutBerhasil();
  } catch (e) {
    return galat(e);
  }
}
