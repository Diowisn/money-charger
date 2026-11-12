import { useEffect, useRef, useState } from "react";
import { Tombol } from "@/components/tombol";
import type { DashboardData } from "@/lib/dashboard";
import { unduhXlsx } from "@/lib/xlsx";
import { fileKeAvatar } from "./gambar";
import { NAMA_TIPE } from "./format";
import {
  IkonHapus,
  IkonKeluar,
  IkonKunci,
  IkonMata,
  IkonPanah,
  IkonRekap,
} from "./ikon";
import type { Kirim, MintaKonfirmasi, StatusLive, Tab, Tema } from "./tipe";

export function Profil({
  bagian,
  data,
  nama,
  kirim,
  tema,
  setTema,
  statusLive,
  navigasi,
  mintaKonfirmasi,
  keluar,
  keluarSemua,
}: {
  bagian: Tab;
  data: DashboardData;
  nama: string;
  kirim: Kirim;
  tema: Tema;
  setTema: (tema: Tema) => void;
  statusLive: StatusLive;
  navigasi: (tab: Tab) => void;
  mintaKonfirmasi: MintaKonfirmasi;
  keluar: () => Promise<void>;
  keluarSemua: () => Promise<void>;
}) {
  const profil = data.profil;
  const namaTampil = profil?.nama?.trim() || nama || "Pengguna Money-Charger";
  const [drafNama, setDrafNama] = useState(profil?.nama ?? nama);
  const [drafEmail, setDrafEmail] = useState(profil?.email ?? "");
  const [drafTelepon, setDrafTelepon] = useState(profil?.telepon ?? "");
  const [drafTanggalLahir, setDrafTanggalLahir] = useState(profil?.tanggalLahir ?? "");
  const [avatarDraf, setAvatarDraf] = useState<string | null | undefined>(undefined);
  const [avatarTampil, setAvatarTampil] = useState<string | null>(profil?.avatar ?? null);
  const [sibukProfil, setSibukProfil] = useState(false);
  const [galatProfil, setGalatProfil] = useState<string | null>(null);
  const [passwordLama, setPasswordLama] = useState("");
  const [passwordBaru, setPasswordBaru] = useState("");
  const [passwordUlang, setPasswordUlang] = useState("");
  const [sesi, setSesi] = useState<{ id: string | null; dibuat: string; kedaluwarsa: string; sekarang: boolean }[]>([]);
  const [secret2fa, setSecret2fa] = useState<{ secret: string; uri: string } | null>(null);
  const [kode2fa, setKode2fa] = useState("");
  const [sandi2fa, setSandi2fa] = useState("");
  const [sisaKodePemulihan, setSisaKodePemulihan] = useState(0);
  const [kodePemulihan, setKodePemulihan] = useState<string[]>([]);
  const [sandiEkspor, setSandiEkspor] = useState("");
  const [emailHapus, setEmailHapus] = useState("");
  const [passwordHapus, setPasswordHapus] = useState("");
  const fotoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDrafNama(profil?.nama ?? nama);
    setDrafEmail(profil?.email ?? "");
    setDrafTelepon(profil?.telepon ?? "");
    setDrafTanggalLahir(profil?.tanggalLahir ?? "");
    setAvatarTampil(profil?.avatar ?? null);
    setAvatarDraf(undefined);
  }, [profil?.nama, profil?.email, profil?.telepon, profil?.tanggalLahir, profil?.avatar, nama]);

  useEffect(() => {
    if (bagian === "ubah-profil") {
      void muatSesi();
      void muat2fa();
    }
  }, [bagian]);

  async function pilihFoto(file: File | undefined) {
    if (!file) return;
    setGalatProfil(null);
    setSibukProfil(true);
    try {
      const hasil = await fileKeAvatar(file);
      setAvatarDraf(hasil);
      setAvatarTampil(hasil);
    } catch (error) {
      setGalatProfil(error instanceof Error ? error.message : "Gagal memproses foto.");
    } finally {
      setSibukProfil(false);
    }
  }

  async function simpanProfil() {
    const email = drafEmail.trim().toLowerCase();
    const namaBaru = drafNama.trim();
    if (!namaBaru) {
      setGalatProfil("Nama tidak boleh kosong.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setGalatProfil("Alamat email tidak valid.");
      return;
    }
    const gantiSandi = Boolean(passwordLama || passwordBaru || passwordUlang);
    if (gantiSandi) {
      if (profil?.punyaPassword && !passwordLama) {
        setGalatProfil("Masukkan password lama.");
        return;
      }
      if (passwordBaru.length < 12) {
        setGalatProfil("Password baru minimal 12 karakter.");
        return;
      }
      if (passwordBaru !== passwordUlang) {
        setGalatProfil("Konfirmasi password tidak sama.");
        return;
      }
    }
    setGalatProfil(null);
    setSibukProfil(true);
    const body: Record<string, unknown> = {
      nama: namaBaru,
      email,
      telepon: drafTelepon.trim(),
      tanggalLahir: drafTanggalLahir,
    };
    if (avatarDraf !== undefined) body.avatar = avatarDraf;
    if (gantiSandi) {
      body.currentPassword = passwordLama;
      body.newPassword = passwordBaru;
    }
    const berhasil = await kirim("/api/profile", "PATCH", body);
    if (berhasil) {
      setAvatarDraf(undefined);
      setPasswordLama("");
      setPasswordBaru("");
      setPasswordUlang("");
    }
    setSibukProfil(false);
  }

  async function hapusProfil() {
    if (!profil) return;
    if (emailHapus.trim().toLowerCase() !== profil.email.toLowerCase()) {
      setGalatProfil("Email konfirmasi tidak sama dengan email akun.");
      return;
    }
    if (profil.punyaPassword && !passwordHapus) {
      setGalatProfil("Masukkan password akun.");
      return;
    }
    const lanjut = await mintaKonfirmasi(
      "Hapus akun permanen?",
      "Seluruh transaksi, utang, target tabungan, pengaturan, dan data akun ini akan dihapus dan tidak bisa dikembalikan.",
    );
    if (!lanjut) return;
    setGalatProfil(null);
    setSibukProfil(true);
    try {
      const res = await fetch("/api/profile", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailHapus.trim(), password: passwordHapus }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setGalatProfil(j.error ?? "Gagal menghapus akun.");
        return;
      }
      window.location.href = "/login";
    } catch {
      setGalatProfil("Tidak bisa menghubungi server.");
    } finally {
      setSibukProfil(false);
    }
  }

  async function muat2fa() {
    try {
      const res = await fetch("/api/profile/2fa", { cache: "no-store", credentials: "same-origin" });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; sisaKodePemulihan?: number };
      if (res.ok && j.ok) setSisaKodePemulihan(j.sisaKodePemulihan ?? 0);
    } catch {
      // Status kode pemulihan bersifat informatif; abaikan bila gagal.
    }
  }

  async function muatSesi() {
    try {
      const res = await fetch("/api/auth/sessions", { cache: "no-store", credentials: "same-origin" });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; data?: typeof sesi };
      if (res.ok && j.ok && j.data) setSesi(j.data);
    } catch {
      // Daftar sesi bersifat informatif; abaikan bila gagal.
    }
  }

  async function cabutSesi(id: string) {
    try {
      await fetch("/api/auth/sessions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokenHash: id }),
      });
      await muatSesi();
    } catch {
      setGalatProfil("Gagal mencabut sesi.");
    }
  }

  async function mulai2fa() {
    try {
      const res = await fetch("/api/profile/2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aksi: "mulai" }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; secret?: string; uri?: string; error?: string };
      if (!res.ok || !j.ok || !j.secret || !j.uri) {
        setGalatProfil(j.error ?? "Gagal memulai 2FA.");
        return;
      }
      setSecret2fa({ secret: j.secret, uri: j.uri });
      setGalatProfil(null);
    } catch {
      setGalatProfil("Tidak bisa menghubungi server.");
    }
  }

  async function aktifkan2fa() {
    try {
      const res = await fetch("/api/profile/2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aksi: "aktifkan", kode: kode2fa }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; kodePemulihan?: string[] };
      if (!res.ok || !j.ok) {
        setGalatProfil(j.error ?? "Gagal mengaktifkan 2FA.");
        return;
      }
      setSecret2fa(null);
      setKode2fa("");
      setKodePemulihan(j.kodePemulihan ?? []);
      setSisaKodePemulihan(j.kodePemulihan?.length ?? 0);
      setGalatProfil(null);
    } catch {
      setGalatProfil("Tidak bisa menghubungi server.");
    }
  }

  async function buatKodePemulihanBaru() {
    try {
      const res = await fetch("/api/profile/2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aksi: "kode-pemulihan" }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; kodePemulihan?: string[] };
      if (!res.ok || !j.ok) {
        setGalatProfil(j.error ?? "Gagal membuat kode pemulihan.");
        return;
      }
      setKodePemulihan(j.kodePemulihan ?? []);
      setSisaKodePemulihan(j.kodePemulihan?.length ?? 0);
      setGalatProfil(null);
    } catch {
      setGalatProfil("Tidak bisa menghubungi server.");
    }
  }

  function unduhKodePemulihan() {
    const isi = [
      "Money-Charger — kode pemulihan 2FA",
      "Setiap kode hanya bisa dipakai sekali. Simpan di tempat aman.",
      "",
      ...kodePemulihan,
    ].join("\n");
    const url = URL.createObjectURL(new Blob([isi], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "money-charger-kode-pemulihan.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function matikan2fa() {
    const ok = await kirim("/api/profile/2fa", "POST", { aksi: "matikan", password: sandi2fa });
    if (ok) {
      setSandi2fa("");
      setKodePemulihan([]);
      setSisaKodePemulihan(0);
    }
  }

  async function unduhEnkripsi() {
    try {
      const res = await fetch("/api/export/encrypted", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: sandiEkspor }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setGalatProfil(j.error ?? "Gagal membuat ekspor.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "money-charger-transaksi.enc";
      a.click();
      URL.revokeObjectURL(url);
      setSandiEkspor("");
    } catch {
      setGalatProfil("Tidak bisa menghubungi server.");
    }
  }

  async function hapusCache() {
    if (!(await mintaKonfirmasi("Hapus cache?", "Data cache dan berkas offline akan dihapus, lalu halaman dimuat ulang."))) return;
    try {
      if ("caches" in window) {
        const kunci = await caches.keys();
        await Promise.all(kunci.map((k) => caches.delete(k)));
      }
    } catch {
      // Cache storage bisa diblokir; reload tetap dilakukan.
    }
    window.location.reload();
  }

  return (
    <div className="profil">
      {bagian === "profil" ? (
        <>
          <section className="profil-head">
            <span className="profil-avatar besar">
              <img src={avatarTampil || "/icon-192.png"} alt="" width={96} height={96} />
            </span>
            <h2>{namaTampil}</h2>
            <p className="muted">{profil?.email ?? "Memuat akun..."}</p>
            <span className={`status-live ${statusLive}`}>
              <i /> {statusLive === "hidup" ? "Tersinkron" : "Koneksi terputus"}
            </span>
            <Tombol varian="sekunder" onClick={() => navigasi("ubah-profil")}>
              Edit profil
            </Tombol>
          </section>

          <section className="profil-daftar">
            <button type="button" onClick={() => navigasi("ubah-profil")}>
              <IkonKunci aktif={false} />
              <span>{profil?.punyaPassword ? "Ubah password" : "Buat password"}</span>
              <IkonPanah />
            </button>
            <button type="button" onClick={() => void unduhXlsx(data.transaksi, NAMA_TIPE)}>
              <IkonRekap aktif={false} />
              <span>Cadangan (ekspor .xlsx)</span>
              <IkonPanah />
            </button>
            <button type="button" onClick={() => setTema(tema === "gelap" ? "terang" : "gelap")}>
              <IkonMata buka={tema === "gelap"} />
              <span>Tema {tema === "gelap" ? "gelap" : "terang"}</span>
              <IkonPanah />
            </button>
            <button type="button" onClick={() => void hapusCache()}>
              <IkonHapus aktif={false} />
              <span>Hapus cache</span>
              <IkonPanah />
            </button>
            <button type="button" className="keluar" onClick={() => void keluar()}>
              <IkonKeluar aktif={false} />
              <span>Log out</span>
              <IkonPanah />
            </button>
          </section>
        </>
      ) : null}

      {bagian === "ubah-profil" ? (
        <>
          <section className="profil-head">
            <span className="profil-avatar besar">
              <img src={avatarTampil || "/icon-192.png"} alt="" width={96} height={96} />
            </span>
            <button type="button" className="tautan" onClick={() => fotoRef.current?.click()} disabled={sibukProfil}>
              Ganti foto
            </button>
            {avatarTampil ? (
              <button type="button" className="tautan muted" onClick={() => { setAvatarDraf(null); setAvatarTampil(null); }}>
                Hapus foto
              </button>
            ) : null}
            <input
              ref={fotoRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={(event) => {
                void pilihFoto(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </section>

          <section className="kartu profil-bagian">
            <h2>Edit profil</h2>
            <div className="form">
              <label>
                Nama lengkap
                <input value={drafNama} onChange={(e) => setDrafNama(e.target.value)} placeholder="Nama kamu" maxLength={60} />
              </label>
              <label>
                Email
                <input type="email" value={drafEmail} onChange={(e) => setDrafEmail(e.target.value)} maxLength={254} />
              </label>
              <label>
                Nomor telepon
                <input type="tel" inputMode="tel" value={drafTelepon} onChange={(e) => setDrafTelepon(e.target.value)} maxLength={20} placeholder="08xxxxxxxxxx" />
              </label>
              <label>
                Tanggal lahir
                <input type="date" value={drafTanggalLahir} onChange={(e) => setDrafTanggalLahir(e.target.value)} />
              </label>
              <h3 className="profil-subjudul">{profil?.punyaPassword ? "Ganti password" : "Buat password"}</h3>
              <p className="muted kecil">Kosongkan bagian ini jika tidak ingin mengganti password. Minimal 12 karakter.</p>
              {profil?.punyaPassword ? (
                <label>
                  Password lama
                  <input type="password" autoComplete="current-password" value={passwordLama} onChange={(e) => setPasswordLama(e.target.value)} maxLength={1024} />
                </label>
              ) : null}
              <label>
                Password baru
                <input type="password" autoComplete="new-password" value={passwordBaru} onChange={(e) => setPasswordBaru(e.target.value)} minLength={12} maxLength={1024} />
              </label>
              <label>
                Ulangi password baru
                <input type="password" autoComplete="new-password" value={passwordUlang} onChange={(e) => setPasswordUlang(e.target.value)} minLength={12} maxLength={1024} />
              </label>
              {galatProfil ? <p className="error" role="alert">{galatProfil}</p> : null}
              <Tombol lebar ukuran="besar" onClick={() => void simpanProfil()} disabled={sibukProfil}>
                {sibukProfil ? "Menyimpan..." : "Update"}
              </Tombol>
            </div>
          </section>

          <section className="kartu profil-bagian">
            <h2>Keamanan 2FA</h2>
            <p className="muted kecil">
              {profil?.duaFaktorAktif ? "2FA aktif. Login membutuhkan kode authenticator." : "2FA belum aktif."}
            </p>
            {!profil?.duaFaktorAktif && !secret2fa ? (
              <Tombol varian="sekunder" lebar onClick={() => void mulai2fa()}>
                Aktifkan 2FA
              </Tombol>
            ) : null}
            {secret2fa ? (
              <div className="form">
                <p className="muted kecil">Tambahkan secret ini ke aplikasi authenticator:</p>
                <code className="kode-secret">{secret2fa.secret}</code>
                <a className="tautan" href={secret2fa.uri}>Buka tautan otpauth</a>
                <label>
                  Kode 6 digit
                  <input inputMode="numeric" maxLength={6} value={kode2fa} onChange={(e) => setKode2fa(e.target.value.replace(/\D/g, "").slice(0, 6))} />
                </label>
                <Tombol lebar disabled={sibukProfil || kode2fa.length !== 6} onClick={() => void aktifkan2fa()}>
                  Verifikasi dan aktifkan
                </Tombol>
              </div>
            ) : null}
            {profil?.duaFaktorAktif ? (
              <div className="form">
                <p className="muted kecil">
                  Sisa kode pemulihan: {sisaKodePemulihan}. Buat kode baru bila habis atau hilang; kode lama langsung tidak berlaku.
                </p>
                <Tombol varian="sekunder" lebar onClick={() => void buatKodePemulihanBaru()}>
                  Buat kode pemulihan baru
                </Tombol>
                {kodePemulihan.length ? (
                  <>
                    <p className="muted kecil">
                      Simpan kode ini sekarang. Setiap kode hanya bisa dipakai sekali dan tidak akan ditampilkan lagi.
                    </p>
                    <pre className="kode-secret">{kodePemulihan.join("\n")}</pre>
                    <Tombol varian="sekunder" lebar onClick={() => unduhKodePemulihan()}>
                      Unduh kode pemulihan
                    </Tombol>
                  </>
                ) : null}
                <label>
                  Password untuk mematikan 2FA
                  <input type="password" autoComplete="current-password" value={sandi2fa} onChange={(e) => setSandi2fa(e.target.value)} />
                </label>
                <Tombol varian="bahaya" lebar disabled={sibukProfil || !sandi2fa} onClick={() => void matikan2fa()}>
                  Matikan 2FA
                </Tombol>
              </div>
            ) : null}
          </section>

          <section className="kartu profil-bagian">
            <h2>Perangkat &amp; sesi</h2>
            <p className="muted kecil">
              {profil?.providers.length ? `Terhubung: ${profil.providers.join(", ")}` : "Login email dan password"}
            </p>
            <ul className="wawasan-daftar">
              {sesi.map((item) => (
                <li key={item.id} className="baris-antara">
                  <span>
                    <b>{item.sekarang ? "Perangkat ini" : "Sesi lain"}</b>
                    <small className="muted"> · dibuat {item.dibuat.slice(0, 10)} · berlaku sampai {item.kedaluwarsa.slice(0, 10)}</small>
                  </span>
                  {item.sekarang || !item.id ? null : (
                    <button type="button" className="tautan muted" onClick={() => void cabutSesi(item.id!)}>
                      Cabut
                    </button>
                  )}
                </li>
              ))}
              {!sesi.length ? <li className="muted kecil">Tidak ada sesi aktif.</li> : null}
            </ul>
            <Tombol varian="bahaya" lebar onClick={() => void keluarSemua()}>
              Log out dari semua perangkat
            </Tombol>
          </section>

          <section className="kartu profil-bagian">
            <h2>Ekspor terenkripsi</h2>
            <p className="muted kecil">Cadangan CSV dienkripsi AES-256-GCM dengan password. Simpan password terpisah.</p>
            <div className="form">
              <label>
                Password ekspor (min. 8 karakter)
                <input type="password" autoComplete="new-password" value={sandiEkspor} onChange={(e) => setSandiEkspor(e.target.value)} />
              </label>
              <Tombol lebar disabled={sibukProfil || sandiEkspor.length < 8} onClick={() => void unduhEnkripsi()}>
                Unduh cadangan terenkripsi
              </Tombol>
            </div>
          </section>
        </>
      ) : null}

      {bagian === "ubah-profil" ? (
        <section className="kartu profil-bagian bahaya">
          <h2>Hapus akun</h2>
          <p className="muted kecil">
            Tindakan permanen. Semua data keuangan milik akun ini ikut terhapus.
          </p>
          <div className="form">
            <label>
              Ketik email akun
              <input type="email" value={emailHapus} onChange={(e) => setEmailHapus(e.target.value)} placeholder={profil?.email ?? ""} />
            </label>
            {profil?.punyaPassword ? (
              <label>
                Password
                <input type="password" autoComplete="current-password" value={passwordHapus} onChange={(e) => setPasswordHapus(e.target.value)} />
              </label>
            ) : null}
            {galatProfil ? <p className="error" role="alert">{galatProfil}</p> : null}
            <Tombol varian="bahaya" lebar onClick={() => void hapusProfil()} disabled={sibukProfil}>
              Hapus akun permanen
            </Tombol>
          </div>
        </section>
      ) : null}
    </div>
  );
}
