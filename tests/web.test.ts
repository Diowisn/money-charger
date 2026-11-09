import { describe, expect, it } from "vitest";
import { bangunDashboard, deteksiLangganan, hitungSkorKesehatan, kebutuhanTarget, proyeksiPengeluaranBulan } from "../src/lib/dashboard";
import { aktifPlan, periodes, totalPlan } from "../src/lib/engine";
import { MemRepo } from "../src/lib/mem-repo";
import {
  AksiError,
  batalkanDebt,
  batalkanTransaksi,
  bayarDebt,
  gantiNamaPos,
  nonaktifkanPos,
  simpanRencana,
  simpanSetup,
  simpanGajiPokok,
  tambahAliasPos,
  tambahDebt,
  tambahPos,
  tambahTransaksi,
} from "../src/lib/web-actions";

const HARI = "2026-01-15";
const GAJI = 1_900_000;

async function repoDenganGaji() {
  const repo = new MemRepo();
  await tambahTransaksi(repo, HARI, { tipe: "gaji", nominal: GAJI, tanggal: "2026-01-10" });
  return repo;
}

describe("dashboard", () => {
  it("membangun ringkasan awal", async () => {
    const state = await new MemRepo().load();
    const d = bangunDashboard(state, HARI);
    expect(d.grup).toHaveLength(2);
    expect(d.posSemua.length).toBe(6);
    expect(d.bolehSetup).toBe(true);
    expect(d.periode.aktif).toBe(false);
    expect(d.transaksi).toHaveLength(0);
    expect(d.ringkasan.totalRencana).toBe(totalPlan(aktifPlan(state)));
  });

  it("menampilkan pengeluaran dan sisa setelah transaksi", async () => {
    const repo = await repoDenganGaji();
    const state = await repo.load();
    const pos = state.subPosts[0];
    await tambahTransaksi(repo, HARI, {
      tipe: "out",
      nominal: 50_000,
      tanggal: HARI,
      subPostId: pos.id,
    });
    const d = bangunDashboard(await repo.load(), HARI);
    expect(d.transaksi).toHaveLength(2);
    expect(d.ringkasan.pengeluaranBulanIni).toBe(50_000);
    expect(d.grup[0].terpakai).toBe(50_000);
  });

  it("menghitung sisa aman harian dari jatah dan rata-rata belanja", async () => {
    const repo = await repoDenganGaji();
    const d = bangunDashboard(await repo.load(), HARI);
    expect(d.sisaAman).not.toBeNull();
    expect(d.sisaAman).toMatchObject({ hariTersisa: 26, perkiraan: true, rataHarian: 0, habisDalamHari: null });
    expect(d.sisaAman!.perHari).toBeGreaterThan(0);
  });

  it("membandingkan pengeluaran kategori dengan bulan sebelumnya", async () => {
    const repo = await repoDenganGaji();
    const pos = (await repo.load()).subPosts[0];
    await tambahTransaksi(repo, HARI, { tipe: "out", nominal: 30_000, tanggal: "2025-12-20", subPostId: pos.id });
    await tambahTransaksi(repo, HARI, { tipe: "out", nominal: 50_000, tanggal: HARI, subPostId: pos.id });
    const d = bangunDashboard(await repo.load(), HARI);
    expect(d.perubahanKategori[0]).toMatchObject({ nama: pos.nama, sekarang: 50_000, sebelumnya: 30_000, delta: 20_000 });
  });

  it("menghitung kebutuhan tabungan target per bulan dan minggu", () => {
    expect(kebutuhanTarget(1_200_000, "2026-04-15", HARI)).toEqual({ perBulan: 400_000, perMinggu: 93_000 });
    expect(kebutuhanTarget(500_000, null, HARI)).toEqual({ perBulan: null, perMinggu: null });
    expect(kebutuhanTarget(0, "2026-04-15", HARI)).toEqual({ perBulan: null, perMinggu: null });
  });

  it("menghitung skor kesehatan dan proyeksi pengeluaran bulanan", () => {
    expect(hitungSkorKesehatan({ rasioAnggaran: 0, rasioTabungan: 0.2, bulanDanaDarurat: 3, saldoPositif: true })).toEqual({ nilai: 100, label: "Sangat sehat" });
    expect(hitungSkorKesehatan({ rasioAnggaran: 1, rasioTabungan: 0, bulanDanaDarurat: 0, saldoPositif: false }).label).toBe("Perlu perhatian");
    expect(proyeksiPengeluaranBulan(310_000, "2026-01-10")).toBe(961_000);
  });

  it("mendeteksi langganan bulanan dengan nominal stabil", async () => {
    const repo = await repoDenganGaji();
    await tambahTransaksi(repo, HARI, { tipe: "out", nominal: 50_000, tanggal: "2025-12-10", label: "Netflix" });
    await tambahTransaksi(repo, HARI, { tipe: "out", nominal: 50_000, tanggal: HARI, label: "Netflix" });
    const hasil = deteksiLangganan(await repo.load());
    expect(hasil).toHaveLength(1);
    expect(hasil[0]).toMatchObject({ nama: "Netflix", nominal: 50_000, jumlah: 2 });
  });

  it("wawasan tersedia di data dashboard", async () => {
    const repo = await repoDenganGaji();
    const d = bangunDashboard(await repo.load(), HARI);
    expect(d.wawasan.skor).toBeGreaterThanOrEqual(0);
    expect(d.wawasan.skor).toBeLessThanOrEqual(100);
    expect(d.wawasan.faktor).toHaveLength(3);
    expect(d.wawasan.proyeksiPengeluaran).toBeGreaterThanOrEqual(0);
  });

  it("menghitung pengeluaran periode awal terhadap rencana aktif", async () => {
    const repo = new MemRepo();
    const state = await repo.load();
    const pos = state.subPosts[0];
    await tambahTransaksi(repo, HARI, {
      tipe: "out",
      nominal: 50_000,
      tanggal: HARI,
      subPostId: pos.id,
    });
    await tambahTransaksi(repo, HARI, { tipe: "out", nominal: 25_000, tanggal: HARI });

    const d = bangunDashboard(await repo.load(), HARI);
    expect(d.periode.aktif).toBe(false);
    expect(d.ringkasan.terpakai).toBe(75_000);
    expect(d.ringkasan.sisaUang).toBe(d.ringkasan.totalRencana - 75_000);
    expect(d.ringkasan.ddSisa).toBe(d.ringkasan.dd - 25_000);
    expect(d.ringkasan.belumDipetakan).toBe(25_000);
    expect(d.ringkasan.kekuranganDD).toBe(0);
    expect(d.grup[0].terpakai).toBe(50_000);
    expect(d.posSemua.find((p) => p.id === pos.id)!.terpakai).toBe(50_000);
    expect(d.transaksi).toHaveLength(2);
  });
});

describe("transaksi web", () => {
  it("mencatat gaji beserta alokasi dan selisih", async () => {
    const repo = await repoDenganGaji();
    const state = await repo.load();
    expect(periodes(state)).toHaveLength(1);
    expect(state.txs.filter((t) => t.tipe === "alokasi_gaji")).toHaveLength(2);
    expect(state.txs.filter((t) => t.tipe === "selisih_gaji")).toHaveLength(1);
    expect(bangunDashboard(state, HARI).periode.aktif).toBe(true);
  });

  it("menolak gaji terlalu dekat, tetapi bisa dipaksa", async () => {
    const repo = await repoDenganGaji();
    await expect(
      tambahTransaksi(repo, HARI, { tipe: "gaji", nominal: 2_000_000, tanggal: "2026-01-12" }),
    ).rejects.toBeInstanceOf(AksiError);
    await tambahTransaksi(repo, HARI, {
      tipe: "gaji",
      nominal: 2_000_000,
      tanggal: "2026-01-12",
      paksa: true,
    });
    expect(periodes(await repo.load())).toHaveLength(2);
  });

  it("membagi bonus otomatis ke jajan dan saldo", async () => {
    const repo = await repoDenganGaji();
    const state = await repo.load();
    const jajan = state.subPosts.find((s) => s.id === state.config.bonusSubPostId)!;
    await tambahTransaksi(repo, HARI, { tipe: "bonus", nominal: 200_000, tanggal: HARI });
    const after = await repo.load();
    expect(after.txs.some((t) => t.tipe === "tambahan_jatah" && t.subPostId === jajan.id && t.nominal === 100_000)).toBe(true);
    expect(after.txs.some((t) => t.tipe === "bonus" && t.wadahTujuan === "saldo" && t.nominal === 100_000)).toBe(true);
  });

  it("memindahkan dana dan menolak saldo wadah kurang", async () => {
    const repo = await repoDenganGaji();
    await tambahTransaksi(repo, HARI, {
      tipe: "pindah",
      nominal: 100_000,
      tanggal: HARI,
      wadahAsal: "tabungan",
      wadahTujuan: "saldo",
    });
    await expect(
      tambahTransaksi(repo, HARI, {
        tipe: "tarik",
        nominal: 10_000_000,
        tanggal: HARI,
        wadahAsal: "investasi",
      }),
    ).rejects.toBeInstanceOf(AksiError);
  });

  it("membatalkan gaji beserta turunannya", async () => {
    const repo = await repoDenganGaji();
    const gaji = (await repo.load()).txs.find((t) => t.tipe === "gaji")!;
    await batalkanTransaksi(repo, gaji.id);
    const state = await repo.load();
    expect(state.txs.find((t) => t.id === gaji.id)!.status).toBe("batal");
    expect(state.txs.filter((t) => t.indukId === gaji.id).every((t) => t.status === "batal")).toBe(true);
    expect(periodes(state)).toHaveLength(0);
  });
});

describe("rencana dan pos web", () => {
  it("menyimpan versi rencana dan menerapkan selisih ke saldo", async () => {
    const repo = await repoDenganGaji();
    const state = await repo.load();
    const plan = aktifPlan(state);
    const pos = state.subPosts[0];
    const items = plan.items.map((i) => ({ ...i }));
    const target = items.find((i) => i.tipe === "sub_pos" && i.subPostId === pos.id)!;
    target.nominal += 50_000;

    await simpanRencana(repo, HARI, items, true);
    const after = await repo.load();
    const baru = aktifPlan(after);
    expect(baru.id).not.toBe(plan.id);
    expect(after.plans.find((p) => p.id === plan.id)!.status).toBe("arsip");
    expect(baru.items.find((i) => i.subPostId === pos.id)!.nominal).toBe(target.nominal);
    expect(after.txs.some((t) => t.tipe === "selisih_gaji" && t.nominal === 50_000 && t.wadahAsal === "saldo")).toBe(true);
  });

  it("menambah, mengganti nama, memberi alias, dan menonaktifkan pos", async () => {
    const repo = new MemRepo();
    const state = await repo.load();
    const { id } = await tambahPos(repo, { groupId: state.groups[0].id, nama: "Susu", jatah: 75_000 });
    await gantiNamaPos(repo, id, "Susu & Teh");
    await tambahAliasPos(repo, id, "teh");
    let after = await repo.load();
    expect(after.subPosts.find((s) => s.id === id)!.nama).toBe("Susu & Teh");
    expect(after.aliases.some((a) => a.subPostId === id && a.alias === "teh")).toBe(true);
    expect(aktifPlan(after).items.some((i) => i.subPostId === id && i.nominal === 75_000)).toBe(true);

    await nonaktifkanPos(repo, id);
    after = await repo.load();
    expect(after.subPosts.find((s) => s.id === id)!.aktif).toBe(false);
    expect(aktifPlan(after).items.some((i) => i.subPostId === id)).toBe(false);
  });

  it("mengunci setup setelah gaji pertama", async () => {
    const repo = new MemRepo();
    await simpanSetup(repo, HARI, {
      tanggalMulai: "2026-01-01",
      saldoAwal: 300_000,
      tabunganAwal: 0,
      investasiAwal: 0,
    });
    expect((await repo.load()).config.saldoAwal).toBe(300_000);

    await tambahTransaksi(repo, HARI, { tipe: "gaji", nominal: GAJI, tanggal: "2026-01-10" });
    await expect(
      simpanSetup(repo, HARI, {
        tanggalMulai: "2026-01-02",
        saldoAwal: 0,
        tabunganAwal: 0,
        investasiAwal: 0,
      }),
    ).rejects.toBeInstanceOf(AksiError);
  });
});

describe("piutang/utang web", () => {
  it("menambah, membayar sebagian, lalu melunasi piutang", async () => {
    const repo = new MemRepo();
    const { id } = await tambahDebt(repo, HARI, { jenis: "piutang", nama: "Andi", nominal: 100_000, tanggal: HARI });
    let hasil = await bayarDebt(repo, id, 40_000);
    expect(hasil).toEqual({ sisa: 60_000, lunas: false });
    hasil = await bayarDebt(repo, id, null);
    expect(hasil).toEqual({ sisa: 0, lunas: true });
    const state = await repo.load();
    expect(state.debts.find((d) => d.id === id)!.status).toBe("lunas");
  });

  it("menolak pembayaran melebihi sisa dan membatalkan catatan", async () => {
    const repo = new MemRepo();
    const { id } = await tambahDebt(repo, HARI, { jenis: "utang", nama: "Budi", nominal: 50_000, tanggal: HARI });
    await expect(bayarDebt(repo, id, 80_000)).rejects.toBeInstanceOf(AksiError);
    await batalkanDebt(repo, id);
    const state = await repo.load();
    expect(state.debts.find((d) => d.id === id)!.status).toBe("batal");
  });
});

describe("gaji pokok web", () => {
  it("menyimpan gaji pokok baru kapan saja", async () => {
    const repo = await repoDenganGaji();
    await simpanGajiPokok(repo, 2_500_000);
    expect((await repo.load()).config.gajiPokok).toBe(2_500_000);
  });

  it("menolak gaji pokok nol atau negatif", async () => {
    await expect(simpanGajiPokok(new MemRepo(), 0)).rejects.toBeInstanceOf(AksiError);
    await expect(simpanGajiPokok(new MemRepo(), -1)).rejects.toBeInstanceOf(AksiError);
  });
});