import { redirect } from "next/navigation";
import { sesiValid } from "@/lib/auth";
import { bangunDashboard } from "@/lib/dashboard";
import { wibDate } from "@/lib/parse/date";
import { PgRepo } from "@/lib/pg-repo";
import Dashboard from "./dashboard";

export const dynamic = "force-dynamic";

export default async function Page() {
  if (!(await sesiValid())) redirect("/login");

  try {
    const state = await new PgRepo().load();
    return <Dashboard awal={bangunDashboard(state, wibDate(Date.now()))} />;
  } catch (e) {
    console.error(e);
    return (
      <main className="auth">
        <div className="auth-kartu">
          <p className="eyebrow">Money-Charger</p>
          <h1>Gagal memuat data</h1>
          <p className="muted">
            Periksa koneksi DATABASE_URL dan pastikan skema sudah dibuat dengan <code>npm run db:setup</code>.
          </p>
        </div>
      </main>
    );
  }
}
