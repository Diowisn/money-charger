import { redirect } from "next/navigation";
import { sesiValid } from "@/lib/auth";
import DashboardView from "./dashboard-view";
import { muatDashboard } from "./model";

export async function dashboardPage() {
  if (!(await sesiValid())) redirect("/login");

  try {
    return <DashboardView awal={await muatDashboard()} />;
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
