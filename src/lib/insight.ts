/**
 * Asisten insight keuangan (gaya FinGPT): menjawab pertanyaan bebas tentang
 * kondisi keuangan pengguna memakai ringkasan dashboard yang sudah dihitung
 * engine. AI tidak menghitung nominal sendiri dan tidak menerima nomor telepon.
 */
import type { DashboardData } from "./dashboard";

export const PERTANYAAN_MAKS = 400;

export type ValidasiPertanyaan =
  | { ok: true; teks: string }
  | { ok: false; error: string };

export function validasiPertanyaan(input: unknown): ValidasiPertanyaan {
  const teks = typeof input === "string" ? input.trim() : "";
  if (teks.length < 3) return { ok: false, error: "Pertanyaan terlalu pendek." };
  if (teks.length > PERTANYAAN_MAKS) return { ok: false, error: "Pertanyaan terlalu panjang (maks 400 karakter)." };
  return { ok: true, teks };
}

const rp = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;

/**
 * Ringkasan teks yang dikirim ke AI. Fungsi murni supaya bisa diuji dan agar
 * isi yang dikirim ke pihak ketiga tetap terbatas pada agregat keuangan.
 */
export function susunKonteksInsight(data: DashboardData): string {
  const r = data.ringkasan;
  const baris: string[] = [];

  baris.push(`Hari ini: ${data.hariIni}`);
  if (data.periode.aktif) {
    baris.push(
      `Periode aktif: ${data.periode.mulai} s/d ${data.periode.akhir ?? "?"}, hari ke-${data.periode.hariKe}, gaji ${rp(
        data.periode.gaji,
      )}`,
    );
  } else {
    baris.push("Belum ada periode gaji aktif.");
  }

  baris.push(
    `Uang: Saldo ${rp(r.saldo)}, Tabungan ${rp(r.tabungan)}, Investasi ${rp(r.investasi)}, Dana Darurat sisa ${rp(
      r.ddSisa,
    )} dari ${rp(r.dd)}.`,
  );
  baris.push(
    `Bulan ini: pendapatan ${rp(r.pendapatanBulanIni)}, pengeluaran ${rp(r.pengeluaranBulanIni)} (termasuk biaya admin).`,
  );
  baris.push(
    `Rencana: total ${rp(r.totalRencana)}, terpakai ${rp(r.terpakai)}, sisa uang ${rp(
      r.sisaUang,
    )}, rasio terpakai ${Math.round(r.rasio * 100)}%. Pengeluaran tanpa pos ${rp(r.belumDipetakan)}.`,
  );
  if (r.kekuranganDD > 0) baris.push(`Dana Darurat kurang ${rp(r.kekuranganDD)}.`);

  if (data.grup.length) {
    baris.push("Alokasi per grup:");
    for (const g of data.grup) {
      baris.push(`- ${g.nama}: jatah ${rp(g.jatah)}, terpakai ${rp(g.terpakai)}`);
    }
  }

  const posMenonjol = data.posSemua
    .filter((p) => p.terpakai > 0 || p.lewat > 0)
    .sort((a, b) => b.terpakai - a.terpakai)
    .slice(0, 10);
  if (posMenonjol.length) {
    baris.push("Pos dengan pemakaian:");
    for (const p of posMenonjol) {
      const lewat = p.lewat > 0 ? `, lewat jatah ${rp(p.lewat)}` : "";
      baris.push(`- ${p.grup} / ${p.nama}: terpakai ${rp(p.terpakai)} dari jatah ${rp(p.jatah)}${lewat}`);
    }
  }

  if (r.piutangAktif > 0 || r.utangAktif > 0) {
    baris.push(`Piutang aktif ${rp(r.piutangAktif)}, utang aktif ${rp(r.utangAktif)}.`);
    for (const d of data.piutang.filter((x) => x.status === "aktif").slice(0, 6)) {
      baris.push(`- ${d.jenis === "piutang" ? "Piutang" : "Utang"} ${d.nama}: sisa ${rp(d.sisa)}`);
    }
  }

  const goals = data.goals.filter((g) => g.status === "aktif");
  if (goals.length) {
    baris.push("Target tabungan aktif:");
    for (const g of goals) {
      baris.push(`- ${g.nama}: ${rp(g.terkumpul)} dari ${rp(g.targetNominal)}`);
    }
  }

  if (data.tren.length) {
    const total = data.tren.reduce((s, t) => s + t.pengeluaran, 0);
    baris.push(
      `Pengeluaran ${data.tren.length} hari terakhir total ${rp(total)}; harian: ${data.tren
        .map((t) => `${t.tanggal.slice(5)} ${rp(t.pengeluaran)}`)
        .join(", ")}.`,
    );
  }

  const transaksi = data.transaksi.filter((t) => t.status === "berlaku").slice(0, 12);
  if (transaksi.length) {
    baris.push("Transaksi terakhir:");
    for (const t of transaksi) {
      const pos = t.subPost ? ` [${t.subPost}]` : "";
      const label = t.label ? ` ${t.label}` : "";
      baris.push(`- ${t.tanggal} ${t.tipe} ${rp(t.nominal)}${pos}${label}`);
    }
  }

  return baris.join("\n");
}

export interface InsightClient {
  /** Mengembalikan jawaban teks, atau null bila gagal/timeout/kuota habis. */
  tanya(pertanyaan: string, konteks: string): Promise<string | null>;
}

const SISTEM = `Kamu asisten keuangan pribadi berbahasa Indonesia yang menjawab berdasarkan DATA yang diberikan.
Aturan:
- Jawab hanya memakai DATA. Jangan mengarang transaksi, nominal, atau pos yang tidak ada.
- Bila DATA tidak cukup untuk menjawab, katakan terus terang dan sebutkan data apa yang perlu dicatat.
- Sebut nominal dalam format Rupiah (mis. Rp1.250.000).
- Ringkas dan praktis: maksimal 6 kalimat atau 5 poin. Boleh menyarankan langkah hemat dari pola DATA.
- Jangan memberi jaminan investasi atau nasihat medis/hukum.`;

export function buatGroqInsightClient(env: NodeJS.ProcessEnv = process.env): InsightClient | null {
  const key = env.GROQ_API_KEY;
  if (!key) return null;
  const model = env.GROQ_INSIGHT_MODEL || env.GROQ_MODEL || "openai/gpt-oss-20b";

  async function sekali(pertanyaan: string, konteks: string): Promise<string | null | "ulang"> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25_000);
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        signal: ctrl.signal,
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          temperature: 0.3,
          max_tokens: 600,
          messages: [
            { role: "system", content: SISTEM },
            { role: "user", content: `DATA:\n${konteks}\n\nPERTANYAAN: ${pertanyaan}` },
          ],
        }),
      });
      if (res.status === 429) return null;
      if (res.status >= 500) return "ulang";
      if (!res.ok) return null;
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const isi = data.choices?.[0]?.message?.content?.trim();
      return isi ? isi.slice(0, 4000) : null;
    } catch (e) {
      return (e as Error).name === "AbortError" ? "ulang" : null;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async tanya(pertanyaan, konteks) {
      const r = await sekali(pertanyaan, konteks);
      if (r !== "ulang") return r;
      const r2 = await sekali(pertanyaan, konteks);
      return r2 === "ulang" ? null : r2;
    },
  };
}
