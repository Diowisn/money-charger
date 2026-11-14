import { redirect } from "next/navigation";
import { userIdDariSesi } from "@/lib/auth";
import DashboardView from "./dashboard-view";
import { muatDashboard } from "./model";

export async function dashboardPage() {
  const userId = await userIdDariSesi();
  if (!userId) redirect("/login");

  try {
    return <DashboardView awal={await muatDashboard(userId)} emailSetupSiap={Boolean(process.env.GMAIL_SETUP_URL?.trim())} />;
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
