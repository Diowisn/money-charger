"use client";

import { useState, type FormEvent } from "react";

export default function LoginForm({ registerFirst, googleEnabled, facebookEnabled, oauthError }: { registerFirst: boolean; googleEnabled: boolean; facebookEnabled: boolean; oauthError?: boolean }) {
  const [register, setRegister] = useState(registerFirst);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [error, setError] = useState<string | null>(oauthError ? "Login Google/Facebook gagal. Coba lagi atau masukkan email dan password." : null);

  async function masuk(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Masukkan email dan password.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Masukkan alamat email yang valid.");
      return;
    }
    if (register && password.length < 12) {
      setError("Password akun baru minimal 12 karakter.");
      return;
    }
    setSibuk(true);
    setError(null);
    try {
      const res = await fetch(register ? "/api/auth/register" : "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setError(j.error ?? "Gagal login.");
        return;
      }
      window.location.href = "/";
    } catch {
      setError("Tidak bisa menghubungi server.");
    } finally {
      setSibuk(false);
    }
  }

  return (
    <form className="form" noValidate onSubmit={(e) => void masuk(e)}>
      <label>
        Email
        <input type="email" autoComplete="email" value={email} onChange={(e) => { setEmail(e.target.value); if (error) setError(null); }} aria-invalid={Boolean(error)} aria-describedby={error ? "login-error" : undefined} autoFocus />
      </label>
      <label>
        Password
        <input
          type="password"
          autoComplete={register ? "new-password" : "current-password"}
          minLength={register ? 12 : undefined}
          maxLength={1024}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (error) setError(null);
          }}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "login-error" : undefined}
          autoFocus
        />
      </label>
      {error ? <p className="error" id="login-error" role="alert">{error}</p> : null}
      <button type="submit" className="utama lebar" disabled={sibuk || !password}>
        {sibuk ? "Memeriksa..." : register ? "Buat akun" : "Masuk"}
      </button>
      {!registerFirst ? <button type="button" className="lebar" onClick={() => setRegister(!register)}>{register ? "Sudah punya akun? Masuk" : "Daftar akun baru"}</button> : null}
      {googleEnabled || facebookEnabled ? <div className="form">
        {googleEnabled ? <a className="lebar" href="/api/auth/oauth/google">Masuk dengan Google</a> : null}
        {facebookEnabled ? <a className="lebar" href="/api/auth/oauth/facebook">Masuk dengan Facebook</a> : null}
      </div> : null}
    </form>
  );
}
