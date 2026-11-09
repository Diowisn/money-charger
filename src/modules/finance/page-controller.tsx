import { redirect } from "next/navigation";
import { userIdDariSesi } from "@/lib/auth";
import DashboardView from "./dashboard-view";
import { muatDashboard } from "./model";

export async function dashboardPage() {
  try {
    const userId = await userIdDariSesi();
    if (!userId) redirect("/login");
    return <DashboardView awal={await muatDashboard(userId)} />;
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
