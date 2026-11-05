import { redirect } from "next/navigation";
import { authDikonfigurasi, sesiValid } from "@/lib/auth";
import LoginForm from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await sesiValid()) redirect("/");
  return (
    <main className="auth">
      <div className="auth-kartu">
        <img className="auth-logo" src="/icon-192.png" alt="" width={64} height={64} />
        <p className="eyebrow">Money-Charger</p>
        <h1>Masuk</h1>
        <p className="muted">Dashboard pribadi keuangan. Masukkan password untuk melanjutkan.</p>
        <LoginForm dikonfigurasi={authDikonfigurasi()} />
      </div>
    </main>
  );
}
