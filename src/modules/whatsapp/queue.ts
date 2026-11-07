import { catatAudit } from "@/lib/audit";
import { tanganiPesan } from "@/lib/handler";
import { klaimInbound, selesaikanInbound } from "@/lib/inbound-queue";
import { kirimOutbox } from "@/lib/outbox";
import { PgRepo } from "@/lib/pg-repo";
import { maskNomor } from "@/lib/whatsapp";
import { buatDeps } from "./model";

export async function prosesAntreanInbound(
  batas = 10,
): Promise<{ diproses: number; selesai: number; gagal: number }> {
  const jobs = await klaimInbound(batas);
  const userId = await new PgRepo().firstUserId();
  let selesai = 0;
  let gagal = 0;

  for (const job of jobs) {
    try {
      const hasil = await tanganiPesan(new PgRepo(undefined, undefined, userId), buatDeps(), job.payload);
      if (hasil) {
        await catatAudit(`wa:${maskNomor(job.payload.from)}`, "pesan_diproses", {
          jenis: job.payload.type,
          pesanId: job.payload.id,
        });
        try {
          const terkirim = await kirimOutbox(hasil.outboxId);
          if (!terkirim) console.error(`Balasan ke ${maskNomor(job.payload.from)} masuk antrean retry.`);
        } catch {
          console.error(`Pengiriman balasan ke ${maskNomor(job.payload.from)} tertunda; outbox akan mencoba ulang.`);
        }
      }
      await selesaikanInbound(job.id, job.percobaan);
      selesai += 1;
    } catch {
      await selesaikanInbound(job.id, job.percobaan, "Pemrosesan pesan gagal.");
      gagal += 1;
    }
  }

  return { diproses: jobs.length, selesai, gagal };
}
