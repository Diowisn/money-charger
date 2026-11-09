import { beforeEach, describe, expect, it } from "vitest";
import type { AiClient, AiRaw } from "@/lib/ai";
import type { StrukRaw, VisionClient } from "@/lib/ai-vision";
import { hitungWadah } from "@/lib/engine";
import { tanganiPesan, type Deps } from "@/lib/handler";
import { MemRepo } from "@/lib/mem-repo";

const OWNER = "628111";
let repo: MemRepo;
let seq = 0;
let ai: AiClient | null;

/** Waktu pesan: tengah hari WIB pada tanggal tertentu. */
const at = (iso: string, jam = 12) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d, jam - 7, 0);
};

async function kirim(teks: string, tgl: string, opsi: { id?: string; from?: string; type?: string; now?: number } = {}) {
  const deps: Deps = { ai, baseUrl: "https://uji.example", now: () => opsi.now ?? at(tgl) };
  const hasil = await tanganiPesan(repo, deps, {
    id: opsi.id ?? `wamid.${++seq}`,
    from: opsi.from ?? OWNER,
    type: opsi.type ?? "text",
    text: opsi.type && opsi.type !== "text" ? undefined : teks,
    timestampMs: at(tgl),
  });
  return hasil?.balasan ?? null;
}

/** Kirim pesan bertipe gambar (foto struk), dengan vision client mock. */
async function kirimFoto(
  tgl: string,
  opsi: {
    id?: string;
    vision?: VisionClient | null;
    unduhGagal?: boolean;
    caption?: string;
    now?: number;
  } = {},
) {
  const deps: Deps = {
    ai: null,
    vision: opsi.vision ?? null,
    unduhMedia: opsi.unduhGagal ? async () => null : async () => ({ base64: "ZmFrZQ==", mimeType: "image/jpeg" }),
    baseUrl: "https://uji.example",
    now: () => opsi.now ?? at(tgl),
  };
  const hasil = await tanganiPesan(repo, deps, {
    id: opsi.id ?? `wamid.${++seq}`,
    from: OWNER,
    type: "image",
    mediaId: "media-123",
    caption: opsi.caption,
    timestampMs: at(tgl),
  });
  return hasil?.balasan ?? null;
}

const visionClient = (raw: StrukRaw | null): VisionClient => ({ parseReceipt: async () => raw });

const wadah = async () => hitungWadah(await repo.load());

beforeEach(() => {
  repo = new MemRepo([OWNER]);
  ai = null;
  seq = 0;
});

/** Setup standar: mulai 17/10 dengan Saldo 300rb, gaji pertama tgl 31/10 -> periode 1. */
async function mulaiPeriode1() {
  await kirim("setup 17/10 saldo 300rb tabungan 0 investasi 0", "2026-10-17");
  await kirim("gaji masuk 1.8 juta", "2026-10-31");
}

describe("AI cadangan (AC-12 sebagian, AC-13, AC-14)", () => {
  beforeEach(mulaiPeriode1);
  const ok = (raw: AiRaw): AiClient => ({ parse: async () => raw });

  it("bahasa bebas dibaca AI, ditampilkan sebagai pratinjau, lalu dicatat setelah ya", async () => {
    ai = ok({ intent: "out", amount_text: "25rb", sub_pos: "Jajan / Kopi / Self-Reward", label: "kopi" });
    const pratinjau = await kirim("tadi beli kopi 25rb pakai gopay", "2026-11-02");
    expect(pratinjau).toContain("Pratinjau AI (belum dicatat)");
    expect(pratinjau).toContain("pengeluaran Rp25.000");
    expect(pratinjau).toContain("Jajan / Kopi / Self-Reward");
    expect((await repo.load()).txs.filter((t) => t.tipe === "out")).toHaveLength(0);

    const r = await kirim("ya", "2026-11-02");
    expect(r).toContain("Tercatat (dibaca AI): Rp25.000, Jajan / Kopi / Self-Reward.");
    expect(r).toContain('Salah? Ketik "hapus terakhir".');
    expect((await repo.load()).txs.at(-1)?.sumber).toBe("ai");
  });

  it("pratinjau AI bisa dibatalkan tanpa mengubah data", async () => {
    ai = ok({ intent: "out", amount_text: "25rb", sub_pos: "Jajan / Kopi / Self-Reward" });
    expect(await kirim("tadi beli kopi 25rb", "2026-11-02")).toContain("Pratinjau AI");
    expect(await kirim("batal", "2026-11-02")).toContain("Dibatalkan");
    expect((await repo.load()).txs.filter((t) => t.tipe === "out")).toHaveLength(0);
  });

  it("ai off menghentikan pengiriman ke provider AI", async () => {
    expect(await kirim("ai off", "2026-11-02")).toContain("AI dinonaktifkan");
    let dipanggil = false;
    ai = {
      parse: async () => {
        dipanggil = true;
        throw new Error("tidak boleh dipanggil");
      },
    };
    expect(await kirim("tadi beli kopi 25rb", "2026-11-02")).toContain("AI sedang nonaktif");
    expect(dipanggil).toBe(false);
    expect(await kirim("ai on", "2026-11-02")).toContain("AI diaktifkan");
  });

  it("AC-13: nominal AI yang tidak ada di pesan ditolak, bot minta format kaku", async () => {
    ai = ok({ intent: "out", amount_text: "35rb", sub_pos: "Jajan / Kopi / Self-Reward" });
    const r = await kirim("tadi beli kopi 25rb", "2026-11-02");
    expect(r).toContain("belum bisa dibaca otomatis");
    expect((await repo.load()).txs.filter((t) => t.tipe === "out")).toHaveLength(0);
  });

  it("AC-14: AI timeout atau kuota habis (null) -> minta format kaku, pesan tidak hilang", async () => {
    ai = { parse: async () => null };
    expect(await kirim("tadi beli kopi 25rb", "2026-11-02")).toContain('Pakai format: "out 25rb kopi"');
  });

  it("tanpa kunci AI juga dibalas, bukan diam", async () => {
    ai = null;
    expect(await kirim("tadi beli kopi 25rb", "2026-11-02")).toContain("belum bisa dibaca otomatis");
  });

  it("intent gaji dari AI tidak dieksekusi", async () => {
    ai = ok({ intent: "gaji", amount_text: "1,8 juta" });
    const r = await kirim("katanya gajian udah masuk 1,8 juta", "2026-12-05");
    expect(r).toContain('ketik: "gaji masuk 1.8 juta"');
    expect((await wadah()).tabungan).toBe(400_000);
  });

  it("kalimat berawalan 'gaji' dengan kata lain tidak mencatat gaji", async () => {
    ai = ok({ intent: "gaji", amount_text: "1,8 juta" });
    const r = await kirim("gaji udah masuk 1,8 juta", "2026-12-05");
    expect(r).toContain("Format kurang tepat");
    expect((await wadah()).tabungan).toBe(400_000);
  });

  it("AI tanpa sub_pos valid -> belum dipetakan dan ditanya setelah ya", async () => {
    ai = ok({ intent: "out", amount_text: "25rb", sub_pos: null });
    expect(await kirim("tadi beli sesuatu 25rb", "2026-11-02")).toContain("Pratinjau AI");
    expect(await kirim("ya", "2026-11-02")).toContain("untuk apa?");
  });
});

describe("foto struk (vision AI)", () => {
  beforeEach(mulaiPeriode1);

  it("foto struk jelas dicatat otomatis sebagai pengeluaran (dibaca AI)", async () => {
    const vision = visionClient({
      intent: "out",
      amount_text: "45rb",
      sub_pos: "Bensin & Parkir",
      label: "SPBU Pertamina",
    });
    const r = await kirimFoto("2026-11-02", { vision });
    expect(r).toContain("Tercatat (dibaca AI): Rp45.000, Bensin & Parkir.");
    expect(r).toContain('Salah? Ketik "hapus terakhir".');
    const t = (await repo.load()).txs.find((x) => x.tipe === "out")!;
    expect(t.nominal).toBe(45_000);
    expect(t.sumber).toBe("ai");
  });

  it("foto yang bukan struk/nominal tidak jelas ditolak sopan", async () => {
    const vision = visionClient({ intent: "tidak_jelas" });
    const r = await kirimFoto("2026-11-02", { vision });
    expect(r).toContain("bukan struk/transaksi");
    expect((await repo.load()).txs.filter((t) => t.tipe === "out")).toHaveLength(0);
  });

  it("tanpa GROQ_API_KEY (vision null) dibalas penolakan foto yang sopan", async () => {
    const r = await kirimFoto("2026-11-02", { vision: null });
    expect(r).toContain("hanya bisa membaca pesan teks dan foto struk");
  });

  it("gagal unduh media dibalas pesan yang jelas, bukan diam", async () => {
    const vision = visionClient({ intent: "out", amount_text: "10rb" });
    const r = await kirimFoto("2026-11-02", { vision, unduhGagal: true });
    expect(r).toContain("Foto belum bisa dibaca otomatis");
  });
});

describe("AC-26: hitung manual satu periode lengkap", () => {
  it("Saldo, Tabungan, Investasi sama persis dengan hitungan tangan", async () => {
    await kirim("setup 17/10 saldo 300rb tabungan 50rb investasi 0", "2026-10-17");
    await kirim("out 25rb bensin", "2026-10-18"); // awal: Saldo 275.000
    await kirim("gaji masuk 1.8 juta", "2026-10-31"); // Tab 450.000, Inv 100.000
    await kirim("out 100rb makan", "2026-11-02");
    await kirim("out 200rb jajan", "2026-11-03"); // jajan lewat 50.000 -> DD sisa 50.000
    await kirim("bonus 200rb", "2026-11-04"); // Saldo +100.000, jatah Jajan 250.000 -> jajan tidak lewat lagi
    // Jajan efektif 250.000, terpakai 200.000 -> sisa 50.000, lewat 0, DD sisa 100.000
    await kirim("tarik tabungan 50rb", "2026-11-10"); // Tab 400.000, Saldo +50.000
    await kirim("gaji masuk 1.8 juta", "2026-11-30");
    // Sisa sub-pos = (1.200.000 + 100.000 tambahan) - 300.000 terpakai = 1.000.000; DD sisa = 100.000
    // Saldo = 275.000 + 100.000 (bonus) + 50.000 (tarik) + 1.100.000 = 1.525.000
    // Tabungan = 50.000 + 400.000 - 50.000 + 400.000 = 800.000 ; Investasi = 200.000
    expect(await wadah()).toEqual({ saldo: 1_525_000, tabungan: 800_000, investasi: 200_000 });
  });
});

