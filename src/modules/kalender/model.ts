import { randomBytes } from "node:crypto";
import { buatIcs, type IcsEvent } from "@/lib/ics";
import { rp } from "@/lib/format";
import { addDays, wibDate } from "@/lib/parse/date";
import { getPool, PgRepo } from "@/lib/pg-repo";
import { daftarAturan, jatuhTempo } from "@/modules/recurring/model";

const BATAS_HARI = 180;

/** Token feed kalender agar aplikasi kalender bisa berlangganan tanpa cookie login. */
export async function tokenKalender(userId: string): Promise<string> {
  const hasil = await getPool().query<{ nilai: string }>(
    "SELECT nilai FROM config WHERE user_id = $1 AND kunci = 'kalender_token'",
    [userId],
  );
  const lama = hasil.rows[0]?.nilai?.trim();
  if (lama) return lama;
  const baru = randomBytes(32).toString("base64url");
  await new PgRepo(undefined, undefined, userId).setConfig("kalender_token", baru);
  return baru;
}

export async function userDariTokenKalender(token: string): Promise<string | null> {
  if (!token || token.length < 32) return null;
  const hasil = await getPool().query<{ user_id: string }>(
    "SELECT user_id FROM config WHERE kunci = 'kalender_token' AND nilai = $1 AND user_id IS NOT NULL",
    [token],
  );
  return hasil.rows[0]?.user_id ?? null;
}

function periodeBerikut(tanggal: string): string {
  const [tahun, bulan] = tanggal.split("-").map(Number);
  return bulan === 12 ? `${tahun + 1}-01` : `${tahun}-${String(bulan + 1).padStart(2, "0")}`;
}

export async function buatKalender(userId: string, hariIni = wibDate(Date.now())): Promise<string> {
  const batas = addDays(hariIni, BATAS_HARI);
  const state = await new PgRepo(undefined, undefined, userId).load();
  const aturan = await daftarAturan(userId, hariIni);
  const events: IcsEvent[] = [];

  for (const rule of aturan) {
    if (!rule.aktif) continue;
    let tanggal = rule.berikutnya;
    for (let i = 0; i < 12 && tanggal && tanggal <= batas; i++) {
      events.push({
        uid: `otomatis-${rule.id}-${tanggal}@money-charger`,
        tanggal,
        ringkasan: `Tagihan: ${rule.nama}`,
        deskripsi: `${rp(rule.nominal)}${rule.subPost ? ` - ${rule.subPost}` : ""}`,
        pengingatHari: 1,
      });
      tanggal = jatuhTempo({ hari: rule.hari }, periodeBerikut(tanggal));
    }
  }

  for (const debt of state.debts) {
    if (debt.status !== "aktif" || !debt.jatuhTempo) continue;
    if (debt.jatuhTempo < hariIni || debt.jatuhTempo > batas) continue;
    const sisa = Math.max(0, debt.nominal - debt.dibayar);
    events.push({
      uid: `debt-${debt.id}@money-charger`,
      tanggal: debt.jatuhTempo,
      ringkasan: `${debt.jenis === "utang" ? "Bayar utang" : "Tagih piutang"}: ${debt.nama}`,
      deskripsi: `Sisa ${rp(sisa)} dari ${rp(debt.nominal)}`,
      pengingatHari: 1,
    });
  }

  for (const goal of state.goals) {
    if (goal.status !== "aktif" || !goal.targetTanggal) continue;
    if (goal.targetTanggal < hariIni || goal.targetTanggal > batas) continue;
    events.push({
      uid: `goal-${goal.id}@money-charger`,
      tanggal: goal.targetTanggal,
      ringkasan: `Target: ${goal.nama}`,
      deskripsi: `Terkumpul ${rp(goal.terkumpul)} dari ${rp(goal.targetNominal)}`,
    });
  }

  events.sort((a, b) => a.tanggal.localeCompare(b.tanggal) || a.ringkasan.localeCompare(b.ringkasan));
  return buatIcs(events, { nama: "Money-Charger" });
}
