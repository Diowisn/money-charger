import { buatGroqInsightClient, susunKonteksInsight, validasiPertanyaan } from "@/lib/insight";
import { AksiError } from "@/lib/web-actions";
import { muatDashboard } from "@/modules/finance/model";

export interface HasilInsight {
  jawaban: string;
  pertanyaan: string;
}

export async function tanyaInsight(input: unknown): Promise<HasilInsight> {
  const v = validasiPertanyaan(input);
  if (!v.ok) throw new AksiError(v.error);

  const client = buatGroqInsightClient();
  if (!client) {
    throw new AksiError("Asisten AI belum aktif. Isi GROQ_API_KEY untuk memakai fitur ini.");
  }

  const data = await muatDashboard();
  const konteks = susunKonteksInsight(data);
  const jawaban = await client.tanya(v.teks, konteks);
  if (!jawaban) {
    throw new AksiError("Asisten sedang tidak bisa menjawab. Coba lagi sebentar lagi.");
  }
  return { jawaban, pertanyaan: v.teks };
}
