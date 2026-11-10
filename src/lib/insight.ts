/**
 * Asisten insight keuangan (gaya FinGPT): menjawab pertanyaan bebas tentang
 * kondisi keuangan pengguna memakai ringkasan dashboard yang sudah dihitung
 * engine. AI tidak menghitung nominal sendiri dan tidak menerima nomor telepon.
 */
import type { DashboardData } from "./dashboard";
import { nominalKeluar } from "./engine";
import { diffDays } from "./parse/date";
import { TURUNAN, type State } from "./types";

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

function namaPos(state: State, id: number | null, label: string | null): string {
  return (id === null ? null : state.subPosts.find((s) => s.id === id)?.nama) ?? label?.trim() ?? "(Tanpa pos)";
}

/** Deteksi anomali konservatif: hanya tampilan, tidak mengubah transaksi. */
export function deteksiAnomali(state: State, hariIni: string, batas = 4): string[] {
  const bulanIni = hariIni.slice(0, 7);
  const perBulan = new Map<string, number>();
  const kategoriBulan = new Map<string, Map<string, number>>();
  const pengeluaran = state.txs.filter((t) => t.status === "berlaku" && t.tipe === "out" && !TURUNAN.has(t.tipe));

  for (const t of pengeluaran) {
    const bulan = t.tanggal.slice(0, 7);
    const nilai = nominalKeluar(t);
    perBulan.set(bulan, (perBulan.get(bulan) ?? 0) + nilai);
    const kategori = kategoriBulan.get(bulan) ?? new Map<string, number>();
    const nama = namaPos(state, t.subPostId, t.label);
    kategori.set(nama, (kategori.get(nama) ?? 0) + nilai);
    kategoriBulan.set(bulan, kategori);
  }

  const hasil: { teks: string; bobot: number }[] = [];
  const bulanLalu = [...perBulan.entries()]
    .filter(([bulan]) => bulan < bulanIni)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .slice(-3)
    .map(([, total]) => total);
  const totalIni = perBulan.get(bulanIni) ?? 0;
  if (bulanLalu.length >= 3 && totalIni > 0) {
    const rata = bulanLalu.reduce((s, n) => s + n, 0) / bulanLalu.length;
    if (rata > 0 && totalIni > rata * 1.5 && totalIni - rata >= 100_000) {
      hasil.push({ teks: `Pengeluaran bulan ini ${rp(totalIni)}, sekitar ${Math.round((totalIni / rata - 1) * 100)}% di atas rata-rata 3 bulan.`, bobot: totalIni - rata });
    }
  }

  const kategoriIni = kategoriBulan.get(bulanIni) ?? new Map<string, number>();
  for (const [nama, total] of kategoriIni) {
    const lalu = [...kategoriBulan.entries()]
      .filter(([bulan]) => bulan < bulanIni)
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .slice(-3)
      .map(([, isi]) => isi.get(nama) ?? 0);
    if (lalu.length < 3 || total < 100_000) continue;
    const rata = lalu.reduce((s, n) => s + n, 0) / lalu.length;
    if (rata > 0 && total > rata * 2) {
      hasil.push({ teks: `${nama} bulan ini ${rp(total)}, lebih dari 2x rata-rata 3 bulan (${rp(Math.round(rata))}).`, bobot: total - rata });
    }
  }

  const batas90 = hariIni;
  const pengeluaran90 = pengeluaran.filter((t) => diffDays(batas90, t.tanggal) <= 90 && diffDays(batas90, t.tanggal) >= 0);
  if (pengeluaran90.length >= 5) {
    const rata = pengeluaran90.reduce((s, t) => s + nominalKeluar(t), 0) / pengeluaran90.length;
    const besar = pengeluaran90
      .filter((t) => t.tanggal.startsWith(bulanIni) && nominalKeluar(t) > rata * 3 && nominalKeluar(t) >= 500_000)
      .sort((a, b) => nominalKeluar(b) - nominalKeluar(a))[0];
    if (besar) {
      hasil.push({
        teks: `Transaksi besar ${namaPos(state, besar.subPostId, besar.label)} ${rp(nominalKeluar(besar))} pada ${besar.tanggal}, jauh di atas rata-rata.`,
        bobot: nominalKeluar(besar),
      });
    }
  }

  return hasil
    .sort((a, b) => b.bobot - a.bobot)
    .slice(0, batas)
    .map((item) => item.teks);
}

/** Agregat seluruh riwayat untuk tanya jawab AI Pro tanpa mengirim data mentah. */
export function susunKonteksRiwayat(state: State, data: DashboardData): string {
  const bulan = new Map<string, { masuk: number; keluar: number; jumlah: number }>();
  const kategori = new Map<string, number>();
  for (const t of state.txs) {
    if (t.status !== "berlaku" || TURUNAN.has(t.tipe)) continue;
    const kunci = t.tanggal.slice(0, 7);
    const isi = bulan.get(kunci) ?? { masuk: 0, keluar: 0, jumlah: 0 };
    isi.jumlah += 1;
    if (t.tipe === "out") {
      isi.keluar += nominalKeluar(t);
      const nama = namaPos(state, t.subPostId, t.label);
      kategori.set(nama, (kategori.get(nama) ?? 0) + nominalKeluar(t));
    } else if (t.tipe === "in" || t.tipe === "gaji" || t.tipe === "bonus") {
      isi.masuk += t.nominal;
    }
    bulan.set(kunci, isi);
  }

  const baris = ["Riwayat seluruh bulan:"];
  for (const [kunci, isi] of [...bulan.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    baris.push(`- ${kunci}: masuk ${rp(isi.masuk)}, keluar ${rp(isi.keluar)}, ${isi.jumlah} transaksi`);
  }
  const kategoriUrut = [...kategori.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  if (kategoriUrut.length) {
    baris.push("Kategori pengeluaran sepanjang riwayat:");
    for (const [nama, total] of kategoriUrut) baris.push(`- ${nama}: ${rp(total)}`);
  }
  const anomali = deteksiAnomali(state, data.hariIni);
  if (anomali.length) {
    baris.push("Anomali terdeteksi:");
    for (const item of anomali) baris.push(`- ${item}`);
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
