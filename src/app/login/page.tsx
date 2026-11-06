import { redirect } from "next/navigation";
import { authDikonfigurasi, sesiValid } from "@/lib/auth";
import { configured } from "@/modules/auth/oauth";
import LoginForm from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await sesiValid()) redirect("/");
  const query = await searchParams;
  return (
    <main className="auth">
      <div className="auth-kartu">
        <img className="auth-logo" src="/icon-192.png" alt="" width={64} height={64} />
        <p className="eyebrow">Money-Charger</p>
        <h1>Masuk</h1>
        <p className="muted">Dashboard pribadi keuangan.</p>
        <LoginForm registerFirst={await authDikonfigurasi()} googleEnabled={configured("google")} facebookEnabled={configured("facebook")} oauthError={query.error === "oauth"} />
      </div>
    </main>
  );
}
