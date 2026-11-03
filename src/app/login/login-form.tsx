"use client";

import { useState, type FormEvent } from "react";

export default function LoginForm({ dikonfigurasi }: { dikonfigurasi: boolean }) {
  const [password, setPassword] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function masuk(e: FormEvent) {
    e.preventDefault();
    setSibuk(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
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

  if (!dikonfigurasi) {
    return (
      <div className="info-kotak">
        <p className="merah">DASHBOARD_PASSWORD belum diatur di server.</p>
        <p className="muted">Tambahkan variabel itu di .env.local atau di pengaturan Vercel, lalu deploy ulang.</p>
      </div>
    );
  }

  return (
    <form className="form" onSubmit={(e) => void masuk(e)}>
      <label>
        Password
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoFocus
        />
      </label>
      {error ? <p className="error">{error}</p> : null}
      <button type="submit" className="utama lebar" disabled={sibuk || !password}>
        {sibuk ? "Memeriksa..." : "Masuk"}
      </button>
    </form>
  );
}
