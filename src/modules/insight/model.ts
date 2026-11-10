import { bangunDashboard } from "@/lib/dashboard";
import { buatGroqInsightClient, susunKonteksInsight, susunKonteksRiwayat, validasiPertanyaan } from "@/lib/insight";
import { bangunLaporan, periodeLaporanTerakhir, teksLaporan } from "@/lib/laporan";
import { wibDate } from "@/lib/parse/date";
import { getPool, PgRepo } from "@/lib/pg-repo";
import { AksiError } from "@/lib/web-actions";

export interface HasilInsight {
  jawaban: string;
  pertanyaan: string;
}

export async function tanyaInsight(input: unknown, userId: string): Promise<HasilInsight> {
  const v = validasiPertanyaan(input);
  if (!v.ok) throw new AksiError(v.error);

  const client = buatGroqInsightClient();
  if (!client) {
    throw new AksiError("Asisten AI belum aktif. Isi GROQ_API_KEY untuk memakai fitur ini.");
  }

  const state = await new PgRepo(undefined, undefined, userId).load();
  const data = bangunDashboard(state, wibDate(Date.now()));
  const konteks = `${susunKonteksInsight(data)}\n\n${susunKonteksRiwayat(state, data)}`;
  const jawaban = await client.tanya(v.teks, konteks);
  if (!jawaban) {
    throw new AksiError("Asisten sedang tidak bisa menjawab. Coba lagi sebentar lagi.");
  }
  return { jawaban, pertanyaan: v.teks };
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

/** Review bulanan otomatis, opt-in, dikirim ke outbox WhatsApp pemilik. */
export async function prosesReviewBulanan(hariIni = wibDate(Date.now())): Promise<{ terkirim: number; dilewati: number; gagal: number }> {
  const client = buatGroqInsightClient();
  if (!client) return { terkirim: 0, dilewati: 0, gagal: 0 };
  const nomor = await nomorPemilik();
  if (!nomor) return { terkirim: 0, dilewati: 0, gagal: 0 };

  const users = await getPool().query("SELECT id FROM auth_users ORDER BY created_at, id");
  let terkirim = 0;
  let dilewati = 0;
  let gagal = 0;

  for (const user of users.rows as { id: string }[]) {
    try {
      const state = await new PgRepo(undefined, undefined, user.id).load();
      if (!state.config.aiReviewAktif) {
        dilewati += 1;
        continue;
      }
      const periode = periodeLaporanTerakhir("bulanan", hariIni);
      if (state.config.aiReviewTerakhir === periode.kunci) {
        dilewati += 1;
        continue;
      }

      const data = bangunDashboard(state, hariIni);
      const laporan = bangunLaporan(state, periode.dari, periode.sampai);
      const konteks = [
        susunKonteksInsight(data),
        susunKonteksRiwayat(state, data),
        `Laporan bulan ${periode.kunci}:\n${teksLaporan(laporan)}`,
      ].join("\n\n");
      const jawaban = await client.tanya(
        `Buat review keuangan bulan ${periode.kunci}: soroti pola, anomali, dan 3 langkah praktis.`,
        konteks,
      );
      if (!jawaban) {
        gagal += 1;
        continue;
      }

      const dikirim = await new PgRepo(undefined, undefined, user.id).transaction(async (tx) => {
        const terbaru = await tx.load();
        if (!terbaru.config.aiReviewAktif || terbaru.config.aiReviewTerakhir === periode.kunci) return false;
        await tx.addOutbox(nomor, `Review bulanan ${periode.kunci}\n\n${jawaban}`);
        await tx.setConfig("ai_review_terakhir", periode.kunci);
        return true;
      });
      if (dikirim) terkirim += 1;
      else dilewati += 1;
    } catch (error) {
      gagal += 1;
      console.error(`Review bulanan gagal (user ${user.id}): ${error instanceof Error ? error.message : "unknown"}`);
    }
  }

  return { terkirim, dilewati, gagal };
}
