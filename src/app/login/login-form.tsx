"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { TautanTombol, Tombol } from "@/components/tombol";

type Tampilan = "awal" | "login" | "lupa" | "daftar";

function IkonGoogle() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z" />
      <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.5l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z" />
      <path fill="#FBBC05" d="M6.4 13.9a6 6 0 0 1 0-3.8V7.5H3.1a10 10 0 0 0 0 9l3.3-2.6z" />
      <path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3.1 7.5l3.3 2.6C7.2 7.8 9.4 6 12 6z" />
    </svg>
  );
}

function IkonFacebook() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#1877F2" d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.2c-1.2 0-1.6.8-1.6 1.6V12h2.7l-.4 2.9h-2.3v7A10 10 0 0 0 22 12z" />
      <path fill="#fff" d="M15.9 14.9 16.3 12h-2.7V10c0-.8.4-1.6 1.6-1.6h1.2V5.9s-1.1-.2-2.2-.2c-2.3 0-3.8 1.4-3.8 3.9V12H7.9v2.9h2.5v7a10.2 10.2 0 0 0 3.2 0v-7h2.3z" />
    </svg>
  );
}

function IkonMata({ buka }: { buka: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2.6" />
      {buka ? <path d="M4 20 20 4" strokeLinecap="round" /> : null}
    </svg>
  );
}

function IkonKembali() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
      <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function LoginForm({
  registerFirst,
  googleEnabled,
  facebookEnabled,
  oauthError,
}: {
  registerFirst: boolean;
  googleEnabled: boolean;
  facebookEnabled: boolean;
  oauthError?: boolean;
}) {
  const [tampilan, setTampilan] = useState<Tampilan>(registerFirst ? "daftar" : "awal");
  const [nama, setNama] = useState("");
  const [email, setEmail] = useState("");
  const [telepon, setTelepon] = useState("");
  const [tanggalLahir, setTanggalLahir] = useState("");
  const [password, setPassword] = useState("");
  const [kode2fa, setKode2fa] = useState("");
  const [perlu2fa, setPerlu2fa] = useState(false);
  const [lihatSandi, setLihatSandi] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [tautanReset, setTautanReset] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(
    oauthError ? "Login Google/Facebook gagal. Coba lagi atau masukkan email dan password." : null,
  );

  function pindah(ke: Tampilan) {
    setError(null);
    setInfo(null);
    setTautanReset(null);
    setPerlu2fa(false);
    setKode2fa("");
    setTampilan(ke);
  }

  async function mintaReset(e: FormEvent) {
    e.preventDefault();
    const emailBersih = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailBersih)) {
      setError("Masukkan alamat email yang valid.");
      return;
    }
    setSibuk(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailBersih }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; pesan?: string; tautan?: string };
      if (!res.ok || !j.ok) {
        setError(j.error ?? "Gagal mengirim tautan reset.");
        return;
      }
      setInfo(j.pesan ?? "Jika email terdaftar, tautan reset sudah dikirim.");
      setTautanReset(j.tautan ?? null);
    } catch {
      setError("Tidak bisa menghubungi server.");
    } finally {
      setSibuk(false);
    }
  }

  async function kirim(e: FormEvent) {
    e.preventDefault();
    const emailBersih = email.trim().toLowerCase();
    if (!emailBersih || !password) {
      setError("Masukkan email dan password.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailBersih)) {
      setError("Masukkan alamat email yang valid.");
      return;
    }
    const daftar = tampilan === "daftar";
    if (daftar && !nama.trim()) {
      setError("Masukkan nama lengkap.");
      return;
    }
    if (daftar && password.length < 12) {
      setError("Password akun baru minimal 12 karakter.");
      return;
    }
    setSibuk(true);
    setError(null);
    try {
      const res = await fetch(daftar ? "/api/auth/register" : "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          daftar
            ? { nama: nama.trim(), email: emailBersih, telepon: telepon.trim(), tanggalLahir, password }
            : { email: emailBersih, password, kode2fa },
        ),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; perlu2fa?: boolean };
      if (!res.ok || !j.ok) {
        if (j.perlu2fa) setPerlu2fa(true);
        setError(j.error ?? (daftar ? "Gagal membuat akun." : "Gagal masuk."));
        return;
      }
      window.location.href = "/";
    } catch {
      setError("Tidak bisa menghubungi server.");
    } finally {
      setSibuk(false);
    }
  }

  function OAuth({ label }: { label: string }) {
    if (!googleEnabled && !facebookEnabled) return null;
    const tombol: ReactNode[] = [];
    if (googleEnabled) {
      tombol.push(
        <TautanTombol key="google" varian="ghost" lebar href="/api/auth/oauth/google" ikon={<IkonGoogle />}>
          Google
        </TautanTombol>,
      );
    }
    if (facebookEnabled) {
      tombol.push(
        <TautanTombol key="facebook" varian="ghost" lebar href="/api/auth/oauth/facebook" ikon={<IkonFacebook />}>
          Facebook
        </TautanTombol>,
      );
    }
    return (
      <>
        <p className="auth2-pisah">{label}</p>
        <div className="auth2-oauth">{tombol}</div>
      </>
    );
  }

  const sandi = (
    <label>
      Password
      <span className="auth2-sandi">
        <input
          type={lihatSandi ? "text" : "password"}
          autoComplete={tampilan === "daftar" ? "new-password" : "current-password"}
          minLength={tampilan === "daftar" ? 12 : undefined}
          maxLength={1024}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (error) setError(null);
          }}
        />
        <button
          type="button"
          className="auth2-lihat"
          onClick={() => setLihatSandi((b) => !b)}
          aria-label={lihatSandi ? "Sembunyikan password" : "Tampilkan password"}
        >
          <IkonMata buka={lihatSandi} />
        </button>
      </span>
    </label>
  );

  return (
    <main className="auth2">
      <div className="auth2-kartu">
        <section className="auth2-hero">
          {tampilan !== "awal" ? (
            <button type="button" className="auth2-kembali" onClick={() => pindah("awal")} aria-label="Kembali">
              <IkonKembali />
            </button>
          ) : null}
          <span className="auth2-logo">
            <img src="/icon-192.png" alt="" width={72} height={72} />
          </span>
          <h1>
            {tampilan === "awal"
              ? "Money-Charger"
              : tampilan === "login"
                ? "Masuk"
                : tampilan === "lupa"
                  ? "Lupa password"
                  : "Daftar"}
          </h1>
          <p>
            {tampilan === "awal"
              ? "Catatan keuangan pribadi dalam satu tempat."
              : tampilan === "login"
                ? "Masuk untuk melanjutkan."
                : tampilan === "lupa"
                  ? "Masukkan email untuk menerima tautan reset."
                  : "Buat akun untuk melanjutkan."}
          </p>
        </section>

        {tampilan === "awal" ? (
          <div className="auth2-isi">
            <Tombol lebar ukuran="besar" onClick={() => pindah("login")}>
              Masuk
            </Tombol>
            <Tombol varian="sekunder" lebar ukuran="besar" onClick={() => pindah("daftar")}>
              Daftar
            </Tombol>
            {error ? <p className="error" role="alert">{error}</p> : null}
            <OAuth label="Atau masuk dengan" />
          </div>
        ) : null}

        {tampilan === "lupa" ? (
          info ? (
            <div className="auth2-isi">
              <div className="info-kotak">
                <b>{info}</b>
                <p className="muted">Tautan berlaku 30 menit dan hanya bisa dipakai sekali. Periksa juga folder spam.</p>
                {tautanReset ? (
                  <p className="muted">
                    Mode pengembangan: <a href={tautanReset}>buka tautan reset</a>
                  </p>
                ) : null}
              </div>
              <Tombol lebar ukuran="besar" onClick={() => pindah("login")}>
                Kembali ke halaman masuk
              </Tombol>
            </div>
          ) : (
            <form className="auth2-isi" noValidate onSubmit={(e) => void mintaReset(e)}>
              <label>
                Email
                <input
                  type="email"
                  autoComplete="email"
                  autoFocus
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError(null);
                  }}
                />
              </label>
              {error ? <p className="error" role="alert">{error}</p> : null}
              <Tombol type="submit" lebar ukuran="besar" disabled={sibuk}>
                {sibuk ? "Mengirim..." : "Kirim tautan reset"}
              </Tombol>
              <p className="auth2-alt">
                Ingat password?{" "}
                <button type="button" className="tautan" onClick={() => pindah("login")}>
                  Masuk
                </button>
              </p>
            </form>
          )
        ) : null}

        {tampilan !== "awal" && tampilan !== "lupa" ? (
          <form className="auth2-isi" noValidate onSubmit={(e) => void kirim(e)}>
            {tampilan === "daftar" ? (
              <>
                <label>
                  Nama lengkap
                  <input
                    autoComplete="name"
                    maxLength={60}
                    value={nama}
                    onChange={(e) => {
                      setNama(e.target.value);
                      if (error) setError(null);
                    }}
                  />
                </label>
                <label>
                  Email
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (error) setError(null);
                    }}
                  />
                </label>
                <label>
                  Tanggal lahir
                  <input
                    type="date"
                    autoComplete="bday"
                    value={tanggalLahir}
                    onChange={(e) => {
                      setTanggalLahir(e.target.value);
                      if (error) setError(null);
                    }}
                  />
                </label>
                <label>
                  Nomor telepon
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    maxLength={20}
                    placeholder="08xxxxxxxxxx"
                    value={telepon}
                    onChange={(e) => {
                      setTelepon(e.target.value);
                      if (error) setError(null);
                    }}
                  />
                </label>
                {sandi}
              </>
            ) : (
              <>
                <label>
                  Email
                  <input
                    type="email"
                    autoComplete="email"
                    autoFocus
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (error) setError(null);
                    }}
                  />
                </label>
                {sandi}
                {perlu2fa ? (
                  <label>
                    Kode 2FA
                    <input
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={kode2fa}
                      onChange={(e) => {
                        setKode2fa(e.target.value.replace(/\D/g, "").slice(0, 6));
                        if (error) setError(null);
                      }}
                    />
                  </label>
                ) : null}
                <p className="auth2-alt">
                  <button type="button" className="tautan" onClick={() => pindah("lupa")}>
                    Lupa password?
                  </button>
                </p>
              </>
            )}

            {error ? <p className="error" role="alert">{error}</p> : null}
            <Tombol type="submit" lebar ukuran="besar" disabled={sibuk}>
              {sibuk ? "Memproses..." : tampilan === "daftar" ? "Daftar" : "Masuk"}
            </Tombol>
            <p className="auth2-alt">
              {tampilan === "daftar" ? "Sudah punya akun? " : "Belum punya akun? "}
              <button type="button" className="tautan" onClick={() => pindah(tampilan === "daftar" ? "login" : "daftar")}>
                {tampilan === "daftar" ? "Masuk" : "Daftar"}
              </button>
            </p>
            <OAuth label={tampilan === "daftar" ? "Atau daftar dengan" : "Atau masuk dengan"} />
          </form>
        ) : null}
      </div>
    </main>
  );
}
