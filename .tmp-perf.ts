import { bangunDashboard } from "./src/lib/dashboard";
import { wibDate } from "./src/lib/parse/date";
import { getPool, PgRepo } from "./src/lib/pg-repo";
import { ambilProfil } from "./src/modules/profile/model";

async function main() {
  const pool = getPool();
  const u = await pool.query("SELECT id FROM auth_users ORDER BY created_at LIMIT 1");
  const userId = u.rows[0].id;
  const hari = wibDate(Date.now());
  for (let i = 0; i < 3; i++) {
    let t = performance.now();
    const state = await new PgRepo(undefined, undefined, userId).load();
    const loadMs = performance.now() - t;
    t = performance.now();
    const data = bangunDashboard(state, hari);
    const buildMs = performance.now() - t;
    t = performance.now();
    const payload = JSON.stringify({ ok: true, data });
    const jsonMs = performance.now() - t;
    t = performance.now();
    await ambilProfil(userId);
    const profilMs = performance.now() - t;
    console.log(JSON.stringify({ run: i + 1, loadMs: +loadMs.toFixed(1), buildMs: +buildMs.toFixed(1), jsonMs: +jsonMs.toFixed(1), profilMs: +profilMs.toFixed(1), bytes: payload.length }));
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
