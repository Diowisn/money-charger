import { emailTerkonfigurasi, kirimEmail } from "@/lib/email-out";
import { bangunLaporan, periodeLaporanTerakhir, teksLaporan, validasiPeriode } from "@/lib/laporan";
import { wibDate } from "@/lib/parse/date";
import { getPool, PgRepo } from "@/lib/pg-repo";

export async function buatLaporan(userId: string, dari?: string | null, sampai?: string | null) {
  const hariIni = wibDate(Date.now());
  const state = await new PgRepo(undefined, undefined, userId).load();
  const periode = validasiPeriode(dari, sampai, hariIni);
  return bangunLaporan(state, periode.dari, periode.sampai);
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

export async function prosesLaporanTerjadwal(hariIni = wibDate(Date.now())): Promise<{ terkirim: number; dilewati: number; gagal: number }> {
  const nomor = await nomorPemilik();
  if (!nomor) return { terkirim: 0, dilewati: 0, gagal: 0 };

  const users = await getPool().query("SELECT id, email FROM auth_users ORDER BY created_at, id");
  let terkirim = 0;
  let dilewati = 0;
  let gagal = 0;

  for (const user of users.rows as { id: string; email: string }[]) {
    try {
      const hasil = await new PgRepo(undefined, undefined, user.id).transaction(async (tx) => {
        const state = await tx.load();
        if (!state.config.laporanAktif) return { status: "dilewati" as const };

        const periode = periodeLaporanTerakhir(state.config.laporanJadwal, hariIni);
        if (state.config.laporanTerakhir === periode.kunci) return { status: "dilewati" as const };

        const data = bangunLaporan(state, periode.dari, periode.sampai);
        const teks = teksLaporan(data);
        await tx.addOutbox(nomor, teks);
        await tx.setConfig("laporan_terakhir", periode.kunci);
        return {
          status: "terkirim" as const,
          email: {
            to: user.email,
            subject: `Laporan Money-Charger ${periode.dari} sampai ${periode.sampai}`,
            teks,
          },
        };
      });

      if (hasil.status === "terkirim") {
        terkirim += 1;
        if (emailTerkonfigurasi()) {
          const ok = await kirimEmail(hasil.email);
          if (!ok) console.error(`Email laporan gagal dikirim ke ${user.email}.`);
        }
      } else {
        dilewati += 1;
      }
    } catch (error) {
      gagal += 1;
      console.error(`Laporan terjadwal gagal (user ${user.id}): ${error instanceof Error ? error.message : "unknown"}`);
    }
  }

  return { terkirim, dilewati, gagal };
}
