import { bangunDashboard, type AturanView, type DashboardData } from "@/lib/dashboard";
import { rp, tglPendek } from "@/lib/format";
import { diffDays, wibDate } from "@/lib/parse/date";
import { getPool, PgRepo } from "@/lib/pg-repo";
import { daftarAturan } from "@/modules/recurring/model";

export function kunciMinggu(iso: string): string {
  const tanggal = new Date(`${iso}T00:00:00Z`);
  const hari = (tanggal.getUTCDay() + 6) % 7;
  tanggal.setUTCDate(tanggal.getUTCDate() - hari + 3);
  const kamisPertama = new Date(Date.UTC(tanggal.getUTCFullYear(), 0, 4));
  const hariKamis = (kamisPertama.getUTCDay() + 6) % 7;
  kamisPertama.setUTCDate(kamisPertama.getUTCDate() - hariKamis + 3);
  const minggu = 1 + Math.round((tanggal.getTime() - kamisPertama.getTime()) / (7 * 86_400_000));
  return `${tanggal.getUTCFullYear()}-W${String(minggu).padStart(2, "0")}`;
}

function tagihanTerdekat(data: DashboardData, hariIni: string): AturanView[] {
  return data.otomatis.filter((item) => {
    if (!item.aktif || !item.berikutnya) return false;
    const jeda = diffDays(item.berikutnya, hariIni);
    return jeda >= 0 && jeda <= 7;
  });
}

export function pesanMingguan(data: DashboardData): string {
  const ringkasan = data.ringkasan;
  const wawasan = data.wawasan;
  const baris = [
    `Ringkasan mingguan Money-Charger (${data.hariIni})`,
    `Pengeluaran bulan ini: ${rp(ringkasan.pengeluaranBulanIni)}`,
    `Sisa anggaran: ${rp(ringkasan.sisaUang)} (${Math.round((1 - ringkasan.rasio) * 100)}% tersisa)`,
    `Proyeksi pengeluaran: ${rp(wawasan.proyeksiPengeluaran)}`,
    `Proyeksi saldo akhir bulan: ${rp(wawasan.proyeksiSaldo)}`,
  ];
  const tagihan = tagihanTerdekat(data, data.hariIni);
  if (tagihan.length) {
    baris.push("Tagihan terdekat:");
    for (const item of tagihan) {
      baris.push(`- ${item.nama} ${rp(item.nominal)} (${tglPendek(item.berikutnya!)})`);
    }
  }
  return baris.join("\n");
}

export function pesanPeringatan(data: DashboardData): string {
  return ["Peringatan Money-Charger", ...data.wawasan.peringatan.map((item) => `- ${item}`)].join("\n");
}

async function nomorPemilik(): Promise<string | null> {
  try {
    const hasil = await getPool().query("SELECT wa_number FROM allowed_numbers WHERE aktif ORDER BY id LIMIT 1");
    return hasil.rows[0]?.wa_number ?? null;
  } catch (error) {
    if ((error as { code?: string }).code === "42P01") return null;
    throw error;
  }
}

export async function prosesDigest(hariIni = wibDate(Date.now())): Promise<{ terkirim: number; dilewati: number; gagal: number }> {
  const nomor = await nomorPemilik();
  if (!nomor) return { terkirim: 0, dilewati: 0, gagal: 0 };

  const users = await getPool().query("SELECT id FROM auth_users ORDER BY created_at, id");
  let terkirim = 0;
  let dilewati = 0;
  let gagal = 0;

  for (const user of users.rows as { id: string }[]) {
    try {
      const aturan = await daftarAturan(user.id, hariIni);
      const hasil = await new PgRepo(undefined, undefined, user.id).transaction(async (tx) => {
        const state = await tx.load();
        if (!state.config.digestAktif) return "dilewati" as const;

        const data = { ...bangunDashboard(state, hariIni), otomatis: aturan };
        const minggu = kunciMinggu(hariIni);
        const perluMingguan = state.config.digestMinggu !== minggu;
        const perluHarian = data.wawasan.peringatan.length > 0 && state.config.digestHarian !== hariIni;
        if (!perluMingguan && !perluHarian) return "dilewati" as const;

        const bagian: string[] = [];
        if (perluMingguan) bagian.push(pesanMingguan(data));
        if (perluHarian) bagian.push(pesanPeringatan(data));
        await tx.addOutbox(nomor, bagian.join("\n\n"));
        if (perluMingguan) await tx.setConfig("digest_minggu", minggu);
        if (perluHarian) await tx.setConfig("digest_harian", hariIni);
        return "terkirim" as const;
      });
      if (hasil === "terkirim") terkirim += 1;
      else dilewati += 1;
    } catch (error) {
      gagal += 1;
      console.error(`Digest gagal (user ${user.id}): ${error instanceof Error ? error.message : "unknown"}`);
    }
  }

  return { terkirim, dilewati, gagal };
}
