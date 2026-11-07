"use client";

import { useState, type FormEvent } from "react";
import { Tombol } from "@/components/tombol";

function IkonMata({ buka }: { buka: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2.6" />
      {buka ? <path d="M4 20 20 4" strokeLinecap="round" /> : null}
    </svg>
  );
}

export default function ResetForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [ulang, setUlang] = useState("");
  const [lihat, setLihat] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selesai, setSelesai] = useState(false);

  async function kirim(e: FormEvent) {
    e.preventDefault();
    if (password.length < 12) {
      setError("Password baru minimal 12 karakter.");
      return;
    }
    if (password !== ulang) {
      setError("Konfirmasi password tidak sama.");
      return;
    }
    setSibuk(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setError(j.error ?? "Gagal memperbarui password.");
        return;
      }
      setSelesai(true);
    } catch {
      setError("Tidak bisa menghubungi server.");
    } finally {
      setSibuk(false);
    }
  }

  return (
    <main className="auth2">
      <div className="auth2-kartu">
        <section className="auth2-hero">
          <a className="auth2-kembali" href="/login" aria-label="Kembali ke halaman masuk">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
          <span className="auth2-logo">
            <img src="/icon-192.png" alt="" width={72} height={72} />
          </span>
          <h1>Reset password</h1>
          <p>Buat password baru untuk akunmu.</p>
        </section>

        <div className="auth2-isi">
          {!token ? (
            <>
              <p className="error" role="alert">Tautan reset tidak valid. Minta tautan baru dari halaman masuk.</p>
              <Tombol lebar ukuran="besar" onClick={() => { window.location.href = "/login"; }}>
                Kembali ke halaman masuk
              </Tombol>
            </>
          ) : selesai ? (
            <>
              <div className="info-kotak">
                <b>Password diperbarui.</b>
                <p className="muted">Semua sesi lama sudah dicabut. Silakan masuk dengan password baru.</p>
              </div>
              <Tombol lebar ukuran="besar" onClick={() => { window.location.href = "/login"; }}>
                Masuk
              </Tombol>
            </>
          ) : (
            <form className="form" noValidate onSubmit={(e) => void kirim(e)}>
              <label>
                Password baru
                <span className="auth2-sandi">
                  <input
                    type={lihat ? "text" : "password"}
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={1024}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (error) setError(null);
                    }}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="auth2-lihat"
                    onClick={() => setLihat((b) => !b)}
                    aria-label={lihat ? "Sembunyikan password" : "Tampilkan password"}
                  >
                    <IkonMata buka={lihat} />
                  </button>
                </span>
              </label>
              <label>
                Ulangi password baru
                <input
                  type={lihat ? "text" : "password"}
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={1024}
                  value={ulang}
                  onChange={(e) => {
                    setUlang(e.target.value);
                    if (error) setError(null);
                  }}
                />
              </label>
              {error ? <p className="error" role="alert">{error}</p> : null}
              <Tombol type="submit" lebar ukuran="besar" disabled={sibuk}>
                {sibuk ? "Menyimpan..." : "Simpan password baru"}
              </Tombol>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
