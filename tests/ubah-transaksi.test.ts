import { describe, expect, it } from "vitest";
import { MemRepo } from "@/lib/mem-repo";
import { AksiError, batalkanTransaksi, tambahAkun, tambahTransaksi, ubahTransaksi } from "@/lib/web-actions";

const HARI = "2026-01-15";

describe("ubah transaksi", () => {
  it("mengubah nominal, tanggal, label, pos, dompet, dan biaya admin", async () => {
    const repo = new MemRepo();
    const state = await repo.load();
    const posA = state.subPosts[0];
    const posB = state.subPosts[1];
    const dompet = await tambahAkun(repo, { nama: "BCA", tipe: "bank", saldoAwal: 100_000 });
    const { id } = await tambahTransaksi(repo, HARI, {
      tipe: "out",
      nominal: 50_000,
      tanggal: HARI,
      label: "lama",
      subPostId: posA.id,
      accountId: dompet.id,
    });

    await ubahTransaksi(repo, HARI, {
      id,
      tanggal: "2026-01-14",
      nominal: 75_000,
      label: "baru",
      subPostId: posB.id,
      accountId: dompet.id,
      biayaAdmin: 2_500,
    });

    const tx = (await repo.load()).txs.find((t) => t.id === id)!;
    expect(tx).toMatchObject({
      nominal: 75_000,
      biayaAdmin: 2_500,
      tanggal: "2026-01-14",
      label: "baru",
      subPostId: posB.id,
      accountId: dompet.id,
      status: "berlaku",
    });
  });

  it("menolak gaji, transaksi batal, dan tanggal masa depan", async () => {
    const repo = new MemRepo();
    const gaji = await tambahTransaksi(repo, HARI, { tipe: "gaji", nominal: 1_900_000, tanggal: "2026-01-10" });
    await expect(
      ubahTransaksi(repo, HARI, { id: gaji.id, tanggal: HARI, nominal: 1_000_000 }),
    ).rejects.toBeInstanceOf(AksiError);

    const { id } = await tambahTransaksi(repo, HARI, { tipe: "in", nominal: 20_000, tanggal: HARI });
    await batalkanTransaksi(repo, id);
    await expect(
      ubahTransaksi(repo, HARI, { id, tanggal: HARI, nominal: 30_000 }),
    ).rejects.toBeInstanceOf(AksiError);

    const lain = await tambahTransaksi(repo, HARI, { tipe: "out", nominal: 20_000, tanggal: HARI });
    await expect(
      ubahTransaksi(repo, HARI, { id: lain.id, tanggal: "2026-01-16", nominal: 20_000 }),
    ).rejects.toBeInstanceOf(AksiError);
  });

  it("tidak mengubah transaksi lain", async () => {
    const repo = new MemRepo();
    const a = await tambahTransaksi(repo, HARI, { tipe: "out", nominal: 10_000, tanggal: HARI });
    const b = await tambahTransaksi(repo, HARI, { tipe: "out", nominal: 20_000, tanggal: HARI });
    await ubahTransaksi(repo, HARI, { id: a.id, tanggal: HARI, nominal: 15_000 });
    const txs = (await repo.load()).txs;
    expect(txs.find((t) => t.id === a.id)!.nominal).toBe(15_000);
    expect(txs.find((t) => t.id === b.id)!.nominal).toBe(20_000);
  });
});
