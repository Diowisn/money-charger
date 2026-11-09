import { beforeEach, describe, expect, it } from "vitest";
import type { AiClient } from "@/lib/ai";
import { buatCsv } from "@/lib/csv";
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

describe("periode awal (AC-07, AC-08)", () => {
  it("pengeluaran sebelum gaji langsung mengurangi Saldo, tanpa jatah", async () => {
    await kirim("setup 17/10 saldo 300rb tabungan 0 investasi 0", "2026-10-17");
    const r = await kirim("out 25rb bensin", "2026-10-17");
    expect(r).toContain("Tercatat: Rp25.000, Bensin & Parkir.");
    expect(r).toContain("Periode awal (belum ada jatah)");
    expect(r).toContain("Saldo sekarang: Rp275.000.");
  });

  it("gaji pertama: tanpa cek 20 hari, Tabungan +400rb, Investasi +100rb, selisih 0", async () => {
    await kirim("setup 17/10 saldo 300rb tabungan 0 investasi 0", "2026-10-17");
    await kirim("out 25rb bensin", "2026-10-17");
    const r = await kirim("gaji masuk 1.8 juta", "2026-10-18"); // hanya 1 hari setelah mulai
    expect(r).toContain("Periode awal ditutup");
    expect(r).toContain("Tabungan +Rp400.000 (total Rp400.000). Investasi +Rp100.000 (total Rp100.000).");
    expect(r).not.toContain("Peringatan: gaji");
    const w = await wadah();
    expect(w).toEqual({ saldo: 275_000, tabungan: 400_000, investasi: 100_000 });
  });

  it("tanpa setup: memakai tanggal pesan pertama dan Rp0, dengan pemberitahuan (FR-03)", async () => {
    const r = await kirim("out 10rb parkir", "2026-10-17");
    expect(r).toContain("Setup otomatis");
    expect((await wadah()).saldo).toBe(-10_000); // boleh minus (AC-04)
  });

  it("setup ditolak setelah ada gaji (FR-04)", async () => {
    await mulaiPeriode1();
    expect(await kirim("setup 01/10 saldo 0", "2026-11-01")).toContain("hanya bisa diulang sebelum gaji pertama");
  });
});

describe("jatah, Dana Darurat, Saldo (AC-01 sampai AC-04, AC-25)", () => {
  beforeEach(mulaiPeriode1);

  it("AC-01: out di periode berjalan memotong jatah sub-pos", async () => {
    const r = await kirim("out 25rb kopi", "2026-11-02");
    expect(r).toContain("Tercatat: Rp25.000, Jajan / Kopi / Self-Reward.");
    expect(r).toContain("Sisa jatah Jajan / Kopi / Self-Reward: Rp125.000 dari Rp150.000.");
  });

  it("AC-02: jebol ditutup Dana Darurat dan disebut jelas", async () => {
    await kirim("out 120rb jajan", "2026-11-02");
    const r = await kirim("out 60rb kopi", "2026-11-03");
    expect(r).toContain("lewat Rp30.000, ditutup Dana Darurat. Sisa Dana Darurat: Rp70.000.");
    expect((await wadah()).saldo).toBe(300_000); // belum menyentuh Saldo
  });

  it("AC-03: DD habis, kekurangan diambil dari Saldo dengan peringatan", async () => {
    await kirim("out 150rb jajan", "2026-11-02"); // jatah habis
    await kirim("out 100rb jajan", "2026-11-03"); // DD habis
    const r = await kirim("out 80rb kopi", "2026-11-04");
    expect(r).toContain("Dana Darurat habis. Rp80.000 diambil dari Saldo. Saldo sekarang: Rp220.000.");
  });

  it("AC-04: Saldo negatif tetap dicatat tanpa penolakan", async () => {
    await kirim("out 150rb jajan", "2026-11-02");
    await kirim("out 100rb jajan", "2026-11-03");
    const r = await kirim("out 500rb kopi", "2026-11-04");
    expect(r).toContain("Tercatat: Rp500.000");
    expect(r).toContain("di bawah nol");
    expect((await wadah()).saldo).toBe(-200_000);
  });

  it("AC-25: penutupan periode memasukkan seluruh sisa jatah dan sisa DD ke Saldo", async () => {
    await kirim("out 50rb makan", "2026-11-05"); // sisa sub-pos = 1.200.000 - 50.000
    const r = await kirim("gaji masuk 1.8 juta", "2026-11-30");
    // sisa = 1.150.000 + DD 100.000 = 1.250.000; Saldo awal 300.000
    expect(r).toContain("Sisa masuk Saldo: Rp1.250.000.");
    expect(await wadah()).toEqual({ saldo: 1_550_000, tabungan: 800_000, investasi: 200_000 });
  });

  it("jatah periode baru kembali ke rencana tanpa membawa sisa (FR-34)", async () => {
    await kirim("out 50rb kopi", "2026-11-05");
    await kirim("gaji masuk 1.8 juta", "2026-11-30");
    expect(await kirim("sisa jajan", "2026-12-01")).toContain("jatah efektif Rp150.000, terpakai Rp0, sisa Rp150.000");
  });
});

describe("gaji (AC-09, AC-10, AC-16, AC-17)", () => {
  beforeEach(mulaiPeriode1);

  it("AC-09: gaji kedua 15 hari setelah gaji pertama minta konfirmasi, data belum berubah", async () => {
    const sebelum = await wadah();
    const r = await kirim("gaji masuk 1.8 juta", "2026-11-15");
    expect(r).toContain("baru 15 hari");
    expect(r).toContain('Balas "ya"');
    expect(await wadah()).toEqual(sebelum);
    const ya = await kirim("ya", "2026-11-15");
    expect(ya).toContain("Gaji Rp1.800.000 dicatat");
    expect((await wadah()).tabungan).toBe(800_000);
  });

  it("konfirmasi 'batal' dan kedaluwarsa 10 menit (FR-82)", async () => {
    await kirim("gaji 1.8jt", "2026-11-15");
    expect(await kirim("batal", "2026-11-15")).toContain("Dibatalkan");
    expect((await wadah()).tabungan).toBe(400_000);

    await kirim("gaji 1.8jt", "2026-11-15", { now: at("2026-11-15") });
    const r = await kirim("ya", "2026-11-15", { now: at("2026-11-15") + 11 * 60_000 });
    expect(r).toContain("kedaluwarsa");
    expect((await wadah()).tabungan).toBe(400_000);
  });

  it("AC-10: gaji kurang dari rencana -> selisih ke Saldo, rencana tidak berubah", async () => {
    await kirim("gaji 1.7jt", "2026-12-01"); // 31 hari kemudian, tanpa konfirmasi
    const w = await wadah();
    // Saldo: 300rb awal + sisa periode 1 (1.300.000) - 100rb selisih
    expect(w.saldo).toBe(300_000 + 1_300_000 - 100_000);
    const lap = await kirim("laporan", "2026-12-01");
    expect(lap).toContain("Laporan periode ke-2");
  });

  it("gaji lebih besar dari rencana: selisih positif ke Saldo, ada peringatan", async () => {
    const r = await kirim("gaji 2jt", "2026-12-01");
    expect(r).toContain("Peringatan: gaji Rp2.000.000 berbeda dari rencana Rp1.800.000 (selisih +Rp200.000)");
  });

  it("AC-16: hapus terakhir pada gaji butuh konfirmasi lalu membuka kembali periode sebelumnya", async () => {
    await kirim("gaji 1.8jt", "2026-12-01");
    const minta = await kirim("hapus terakhir", "2026-12-01");
    expect(minta).toContain('Balas "ya"');
    expect((await wadah()).tabungan).toBe(800_000); // belum berubah
    const ya = await kirim("ya", "2026-12-01");
    expect(ya).toContain("Periode ke-1 terbuka kembali");
    expect(await wadah()).toEqual({ saldo: 300_000, tabungan: 400_000, investasi: 100_000 });
  });

  it("AC-17: gaji terlambat -> periode tetap terbuka dan laporan menyebut hari", async () => {
    await kirim("out 10rb kopi", "2026-12-05");
    const lap = await kirim("laporan", "2026-12-05");
    expect(lap).toContain("Laporan periode ke-1 (mulai 31/10, hari ke-36)");
    expect(lap).toContain("Jajan / Kopi / Self-Reward: Rp10.000 dari Rp150.000");
  });

  it("gaji bisa diberi tanggal agar batas periode tepat (FR-25)", async () => {
    await kirim("out 10rb kopi", "2026-12-02");
    await kirim("gaji 1.8jt tgl 30/11", "2026-12-02");
    // pengeluaran tgl 2/12 masuk periode 2; periode 1 tertutup tanpa pengeluaran
    expect(await kirim("sisa jajan", "2026-12-02")).toContain("terpakai Rp10.000");
    expect((await wadah()).saldo).toBe(300_000 + 1_300_000);
  });
});

describe("bonus (AC-11)", () => {
  beforeEach(mulaiPeriode1);

  it("bonus ganjil: Jajan dibulatkan ke bawah, sisanya ke Saldo", async () => {
    const r = await kirim("bonus 150001", "2026-11-05");
    expect(r).toContain("Saldo +Rp75.001");
    expect(r).toContain("+Rp75.000");
    expect(await kirim("sisa jajan", "2026-11-05")).toContain("jatah efektif Rp225.000");
    expect((await wadah()).saldo).toBe(300_001 + 75_000);
  });

  it("tambahan jatah Jajan yang tidak terpakai masuk Saldo saat periode ditutup", async () => {
    await kirim("bonus 200rb", "2026-11-05");
    await kirim("gaji masuk 1.8 juta", "2026-11-30");
    // Saldo: 300rb + 100rb(bonus) + sisa (1.200.000 + 100.000 tambahan + 100.000 DD)
    expect((await wadah()).saldo).toBe(300_000 + 100_000 + 1_400_000);
  });

  it("bonus ke tabungan tidak dibagi (FR-41)", async () => {
    await kirim("bonus 200rb ke tabungan", "2026-11-05");
    expect(await wadah()).toEqual({ saldo: 300_000, tabungan: 600_000, investasi: 100_000 });
  });

  it("hapus terakhir pada bonus membatalkan semua bagiannya", async () => {
    await kirim("bonus 200rb", "2026-11-05");
    await kirim("hapus terakhir", "2026-11-05");
    expect((await wadah()).saldo).toBe(300_000);
    expect(await kirim("sisa jajan", "2026-11-05")).toContain("jatah efektif Rp150.000");
  });

  it("bonus di periode awal seluruhnya ke Saldo", async () => {
    repo = new MemRepo([OWNER]);
    await kirim("setup 17/10 saldo 0 tabungan 0 investasi 0", "2026-10-17");
    const r = await kirim("bonus 200rb", "2026-10-20");
    expect(r).toContain("seluruhnya ke Saldo");
    expect((await wadah()).saldo).toBe(200_000);
  });
});

describe("keandalan dan keamanan (AC-05, AC-06, AC-18, AC-19)", () => {
  beforeEach(mulaiPeriode1);

  it("AC-05: pesan dengan ID Meta sama hanya diproses sekali", async () => {
    const a = await kirim("out 25rb kopi", "2026-11-02", { id: "wamid.SAMA" });
    const b = await kirim("out 25rb kopi", "2026-11-02", { id: "wamid.SAMA" });
    expect(a).toBeTruthy();
    expect(b).toBeNull();
    expect(await kirim("sisa jajan", "2026-11-02")).toContain("terpakai Rp25.000");
  });

  it("AC-06: nomor di luar whitelist tidak dibalas dan tidak mencatat", async () => {
    const r = await kirim("out 25rb kopi", "2026-11-02", { from: "62999" });
    expect(r).toBeNull();
    expect((await repo.load()).txs.filter((t) => t.tipe === "out")).toHaveLength(0);
  });

  it("AC-18: dua out beruntun cepat tidak saling menimpa", async () => {
    await Promise.all([kirim("out 20rb kopi", "2026-11-02"), kirim("out 30rb es", "2026-11-02")]);
    expect(await kirim("sisa jajan", "2026-11-02")).toContain("terpakai Rp50.000, sisa Rp100.000");
  });

  it("gagal di tengah jalan di-rollback, kiriman ulang diproses ulang", async () => {
    const rusak: AiClient = { parse: async () => { throw new Error("jaringan putus"); } };
    ai = rusak;
    await expect(kirim("tadi beli kopi 25rb", "2026-11-02", { id: "wamid.ULANG" })).rejects.toThrow();
    ai = null;
    const r = await kirim("out 25rb kopi", "2026-11-02", { id: "wamid.ULANG" });
    expect(r).toContain("Tercatat");
  });

  it("AC-19: foto, stiker, dan audio dibalas penolakan sopan", async () => {
    for (const type of ["image", "sticker", "audio"]) {
      expect(await kirim("", "2026-11-02", { type })).toContain("hanya bisa membaca pesan teks");
    }
  });
});

describe("pemetaan pos (FR-15, 6.2)", () => {
  beforeEach(mulaiPeriode1);

  it("tanpa alias: belum dipetakan, ditanya, dihitung ke DD, lalu dijawab", async () => {
    const r = await kirim("out 40rb entah apa", "2026-11-02");
    expect(r).toContain("belum dipetakan");
    expect(r).toContain("Rp40.000 untuk apa? Balas nama pos:");
    expect(r).toContain("Sisa Dana Darurat: Rp60.000");
    const j = await kirim("ortu", "2026-11-02");
    expect(j).toContain("Dipetakan ke Uang Orang Tua.");
    expect(j).toContain("Sisa jatah Uang Orang Tua: Rp310.000 dari Rp350.000.");
  });

  it("lebih dari satu pos cocok: bertanya, tidak menebak", async () => {
    const r = await kirim("out 30rb makan di warung parkir", "2026-11-02");
    expect(r).toContain("lebih dari satu pos");
  });

  it("jawaban pos tidak dikenali meminta ulang", async () => {
    await kirim("out 40rb entah", "2026-11-02");
    expect(await kirim("hmm", "2026-11-02")).toContain("tidak dikenali");
  });

  it('balas "tanpa pos" membiarkan transaksi tidak dipetakan', async () => {
    await kirim("out 40rb entah apa", "2026-11-02");
    const r = await kirim("tanpa pos", "2026-11-02");
    expect(r).toContain("tetap tanpa pos");
    const t = (await repo.load()).txs.find((x) => x.tipe === "out")!;
    expect(t.subPostId).toBeNull();
  });
});

describe("biaya admin pada pengeluaran", () => {
  beforeEach(mulaiPeriode1);

  it("out dengan admin fee dicatat dan masuk hitungan sisa jatah", async () => {
    const r = await kirim("out 12.500 admin 2.500 kopi", "2026-11-02");
    expect(r).toContain("Rp12.500 + admin Rp2.500 (total Rp15.000)");
    expect(await kirim("sisa jajan", "2026-11-02")).toContain("terpakai Rp15.000, sisa Rp135.000");
  });

  it("biaya admin ikut terhitung belum dipetakan bila tanpa pos", async () => {
    const r = await kirim("out 10rb biaya admin 1rb entah", "2026-11-02");
    expect(r).toContain("Rp10.000 + admin Rp1.000 (total Rp11.000)");
    expect(r).toContain("Sisa Dana Darurat: Rp89.000");
  });
});

describe("transaksi mundur (AC-15) dan koreksi", () => {
  beforeEach(async () => {
    await mulaiPeriode1();
    await kirim("gaji masuk 1.8 juta", "2026-11-30");
  });

  it("AC-15: pengeluaran 'kemarin' yang jatuh di periode lama dihitung ulang dengan peringatan", async () => {
    const saldoSebelum = (await wadah()).saldo;
    const r = await kirim("out 50rb makan kemarin", "2026-11-30"); // 29/11 -> periode 1
    expect(r).toContain("Peringatan: tanggal ini masuk periode ke-1");
    expect((await wadah()).saldo).toBe(saldoSebelum - 50_000); // sisa periode 1 yang masuk Saldo berkurang
  });

  it("koreksi nominal membatalkan catatan lama dan membuat pengganti", async () => {
    await kirim("out 25rb kopi", "2026-12-01");
    const r = await kirim("koreksi nominal 30rb", "2026-12-01");
    expect(r).toContain("Koreksi tersimpan");
    expect(r).toContain("Sisa jatah Jajan / Kopi / Self-Reward: Rp120.000 dari Rp150.000.");
    const txs = (await repo.load()).txs.filter((t) => t.tipe === "out");
    expect(txs.map((t) => [t.nominal, t.status])).toEqual([[25_000, "batal"], [30_000, "berlaku"]]);
    expect(txs[1].penggantiDari).toBe(txs[0].id);
  });

  it("hapus terakhir membatalkan tanpa menghapus baris", async () => {
    await kirim("out 25rb kopi", "2026-12-01");
    await kirim("hapus terakhir", "2026-12-01");
    expect((await repo.load()).txs.filter((t) => t.tipe === "out")[0].status).toBe("batal");
  });
});

describe("wadah (AC-20, AC-21)", () => {
  beforeEach(mulaiPeriode1);

  it("AC-20: tarik tabungan memindahkan ke Saldo", async () => {
    await kirim("tarik tabungan 200rb", "2026-11-02");
    expect(await wadah()).toEqual({ saldo: 500_000, tabungan: 200_000, investasi: 100_000 });
  });

  it("AC-21: pindah melebihi isi wadah asal ditolak dengan menyebut isinya", async () => {
    const r = await kirim("pindah 500rb dari investasi ke saldo", "2026-11-02");
    expect(r).toContain("isi investasi hanya Rp100.000");
    expect(await wadah()).toEqual({ saldo: 300_000, tabungan: 400_000, investasi: 100_000 });
  });

  it("pindah dari saldo boleh membuat Saldo minus", async () => {
    await kirim("pindah 400rb dari saldo ke tabungan", "2026-11-02");
    expect(await wadah()).toEqual({ saldo: -100_000, tabungan: 800_000, investasi: 100_000 });
  });
});

describe("rencana (AC-22, FR-50 sampai FR-54)", () => {
  beforeEach(mulaiPeriode1);

  it("AC-22: set tanpa 'sekarang' berlaku mulai periode berikutnya", async () => {
    const r = await kirim("set makan 400rb", "2026-11-02");
    expect(r).toContain("Berlaku mulai periode berikutnya");
    expect(r).toContain("selisih +Rp50.000 dari gaji pokok");
    expect(await kirim("sisa makan", "2026-11-02")).toContain("jatah efektif Rp350.000");
    await kirim("gaji masuk 1.8 juta", "2026-11-30");
    expect(await kirim("sisa makan", "2026-12-01")).toContain("jatah efektif Rp400.000");
  });

  it("set dengan 'sekarang' berlaku di periode berjalan dan selisihnya dari Saldo", async () => {
    const r = await kirim("set makan 400rb sekarang", "2026-11-02");
    expect(r).toContain("Berlaku juga di periode berjalan");
    expect(await kirim("sisa makan", "2026-11-02")).toContain("jatah efektif Rp400.000");
    expect((await wadah()).saldo).toBe(250_000);
  });

  it("versi rencana lama tetap tersimpan (FR-54)", async () => {
    await kirim("set makan 400rb", "2026-11-02");
    const plans = (await repo.load()).plans;
    expect(plans.map((p) => p.status)).toEqual(["arsip", "aktif"]);
  });

  it("geser memindahkan jatah di periode berjalan saja", async () => {
    const r = await kirim("geser 50rb dari jajan ke bensin", "2026-11-02");
    expect(r).toContain("periode ini saja");
    expect(await kirim("sisa bensin", "2026-11-02")).toContain("jatah efektif Rp200.000");
    expect(await kirim("geser 999rb dari jajan ke bensin", "2026-11-02")).toContain("tidak cukup");
  });

  it("kelola pos: tambah, alias, ganti, hapus", async () => {
    expect(await kirim("pos tambah operasional laundry 50rb", "2026-11-02")).toContain("Pos ditambahkan: Laundry (Operasional Harian), jatah Rp50.000");
    expect(await kirim("pos alias cuci laundry", "2026-11-02")).toContain('Alias "cuci" ditambahkan');
    const r = await kirim("out 20rb cuci baju", "2026-11-02");
    expect(r).toContain("Laundry"); // pos baru belum punya jatah di periode ini -> lewat -> DD
    expect(await kirim("pos ganti laundry binatu", "2026-11-02")).toContain('menjadi "Binatu"');
    expect(await kirim("pos hapus binatu", "2026-11-02")).toContain("dinonaktifkan");
    expect((await repo.load()).subPosts.find((s) => s.nama === "Binatu")?.aktif).toBe(false);
  });
});

describe("evaluasi dan usulan (FR-60, FR-61)", () => {
  beforeEach(async () => {
    await mulaiPeriode1();
    await kirim("out 233rb makan", "2026-11-05");
    await kirim("out 61rb kopi", "2026-11-06");
  });

  it("balasan gaji memuat rencana vs kenyataan dan usulan dibulatkan ke atas Rp10.000", async () => {
    const r = await kirim("gaji masuk 1.8 juta", "2026-11-30");
    expect(r).toContain("Rencana vs kenyataan periode ke-1");
    expect(r).toContain("Bahan Bekal & Makan: Rp350.000 jadi Rp240.000");
    expect(r).toContain("Jajan / Kopi / Self-Reward: Rp150.000 jadi Rp70.000");
    expect(r).toContain('Balas "setuju"');
  });

  it("usulan baru berlaku setelah 'setuju'; 'tolak' membuangnya", async () => {
    await kirim("gaji masuk 1.8 juta", "2026-11-30");
    expect(await kirim("sisa makan", "2026-12-01")).toContain("jatah efektif Rp350.000"); // belum berlaku
    expect(await kirim("setuju", "2026-12-01")).toContain("mulai periode berikutnya");
    await kirim("gaji masuk 1.8 juta", "2026-12-31");
    expect(await kirim("sisa makan", "2027-01-01")).toContain("jatah efektif Rp240.000");
  });

  it("tolak membuang usulan", async () => {
    await kirim("gaji masuk 1.8 juta", "2026-11-30");
    expect(await kirim("tolak", "2026-12-01")).toContain("Usulan dibuang");
    expect(await kirim("setuju", "2026-12-01")).toContain("Tidak ada usulan");
  });

  it("periode tertutup tanpa pengeluaran tercatat tidak menghasilkan usulan Rp0", async () => {
    repo = new MemRepo([OWNER]);
    await kirim("gaji masuk 1.8 juta", "2026-10-31");
    const r = await kirim("gaji masuk 1.8 juta", "2026-11-30");
    expect(r).toContain("belum ada pengeluaran tercatat");
    expect(r).not.toContain("jadi Rp0");
  });

  it("evaluasi di periode pertama belum menghasilkan usulan", async () => {
    const r = await kirim("evaluasi", "2026-11-10");
    expect(r).toContain("Belum ada periode yang tertutup");
  });
});

describe("piutang dan utang", () => {
  beforeEach(mulaiPeriode1);

  it("mencatat piutang, menampilkan daftar, dan melunasi sebagian lalu penuh", async () => {
    const tambah = await kirim("piutang 100rb Andi", "2026-11-02");
    expect(tambah).toContain("Piutang");
    expect(tambah).toContain("Rp100.000 atas nama Andi");

    const daftar = await kirim("piutang", "2026-11-02");
    expect(daftar).toContain("Andi: sisa Rp100.000 dari Rp100.000");

    const bayar1 = await kirim("bayar piutang Andi 40rb", "2026-11-03");
    expect(bayar1).toContain("Rp40.000 diterima dari Andi");
    expect(bayar1).toContain("Sisa piutang: Rp60.000");

    const lunas = await kirim("lunasi piutang Andi", "2026-11-04");
    expect(lunas).toContain("lunas");

    expect(await kirim("piutang", "2026-11-04")).toContain("tidak ada");
  });

  it("mencatat utang dan menolak pembayaran melebihi sisa", async () => {
    await kirim("utang 50rb Budi", "2026-11-02");
    const r = await kirim("bayar utang Budi 80rb", "2026-11-03");
    expect(r).toContain("melebihi sisa");
  });
});

describe("target tabungan (goal)", () => {
  beforeEach(mulaiPeriode1);

  it("membuat target, menabung sebagian, lalu mencapai target", async () => {
    const tambah = await kirim("target 100rb Laptop Baru", "2026-11-02");
    expect(tambah).toContain("Target tabungan dicatat: Laptop Baru, Rp100.000");

    const daftar = await kirim("target", "2026-11-02");
    expect(daftar).toContain("Laptop Baru: Rp0 dari Rp100.000 (0%)");

    const nabung1 = await kirim("nabung 40rb Laptop Baru", "2026-11-03");
    expect(nabung1).toContain("Rp40.000 ditabung ke Laptop Baru");
    expect(nabung1).toContain("Terkumpul Rp40.000 dari Rp100.000 (sisa Rp60.000)");

    const nabung2 = await kirim("nabung 60rb Laptop Baru", "2026-11-04");
    expect(nabung2).toContain("Target tercapai!");

    const setelah = await kirim("target", "2026-11-04");
    expect(setelah).toContain("tidak ada"); // sudah selesai, tidak lagi aktif
  });

  it("menabung ke nama yang tidak ada memberi pesan jelas", async () => {
    const r = await kirim("nabung 10rb Entah Apa", "2026-11-02");
    expect(r).toContain("Tidak ada target tabungan aktif");
  });
});

describe("laporan, ekspor, bantuan (AC-23)", () => {
  beforeEach(mulaiPeriode1);

  it("laporan per grup dengan rincian sub-pos, DD, dan tiga wadah", async () => {
    await kirim("out 25rb kopi", "2026-11-02");
    await kirim("out 15rb entah", "2026-11-02");
    const r = await kirim("laporan", "2026-11-02");
    expect(r).toContain("Operasional Harian: terpakai Rp0 dari Rp700.000");
    expect(r).toContain("- Jajan / Kopi / Self-Reward: Rp25.000 dari Rp150.000 (sisa Rp125.000)");
    expect(r).toContain("Belum dipetakan: Rp15.000");
    expect(r).toContain("Tabungan: Rp400.000");
  });

  it("laporan periode menampilkan periode tertutup terakhir", async () => {
    expect(await kirim("laporan periode", "2026-11-02")).toContain("Belum ada periode yang tertutup");
    await kirim("gaji masuk 1.8 juta", "2026-11-30");
    expect(await kirim("laporan periode", "2026-11-30")).toContain("Periode ke-1 (31/10 sampai sebelum 30/11), sudah ditutup");
  });

  it("AC-23: ekspor memberi tautan berlaku singkat dan sekali pakai; CSV memuat yang batal", async () => {
    await kirim("out 25rb kopi", "2026-11-02");
    await kirim("hapus terakhir", "2026-11-02");
    const r = (await kirim("ekspor", "2026-11-02", { now: at("2026-11-02") }))!;
    const token = /t=([0-9a-f]{48})/.exec(r)![1];
    const { createHash } = await import("node:crypto");
    const hash = createHash("sha256").update(token).digest("hex");
    expect(await repo.consumeExport(hash, at("2026-11-02") + 60_000)).toBe(true);
    expect(await repo.consumeExport(hash, at("2026-11-02") + 60_000)).toBe(false); // sekali pakai
    const csv = buatCsv(await repo.load());
    expect(csv.split("\n")[0]).toContain("status");
    expect(csv).toContain("batal");
  });

  it("tautan ekspor kedaluwarsa setelah 15 menit", async () => {
    const r = (await kirim("ekspor", "2026-11-02", { now: at("2026-11-02") }))!;
    const token = /t=([0-9a-f]{48})/.exec(r)![1];
    const { createHash } = await import("node:crypto");
    const hash = createHash("sha256").update(token).digest("hex");
    expect(await repo.consumeExport(hash, at("2026-11-02") + 16 * 60_000)).toBe(false);
  });

  it("aman menampilkan batas harian, rata-rata belanja, dan proyeksi saldo", async () => {
    await kirim("out 25rb kopi", "2026-11-02");
    const r = (await kirim("aman", "2026-11-02"))!;
    expect(r).toContain("Sisa aman: Rp");
    expect(r).toContain("/hari untuk 29 hari (perkiraan 30 hari sejak gaji).");
    expect(r).toContain("Rata-rata belanja 14 hari:");
    expect(r).toContain("Status:");
  });

  it("bantuan dan perintah tidak dikenali", async () => {
    expect(await kirim("bantuan", "2026-11-02")).toContain("out 25rb kopi");
    expect(await kirim("bantuan", "2026-11-02")).toContain("aman");
    expect(await kirim("halo apa kabar", "2026-11-02")).toContain("tidak dikenali");
  });
});

