import { describe, expect, it } from "vitest";
import { hitungAkun } from "@/lib/engine";
import { MemRepo } from "@/lib/mem-repo";
import { buatTx } from "@/lib/types";
import { pindahAkun, tambahAkun, tambahTransaksi } from "@/lib/web-actions";

describe("dompet multi-akun", () => {
  it("menghitung saldo per dompet dari gaji, alokasi, pengeluaran, dan transfer", async () => {
    const repo = new MemRepo();
    const bca = await tambahAkun(repo, { nama: "BCA", tipe: "bank", saldoAwal: 100_000 });
    const gopay = await tambahAkun(repo, { nama: "GoPay", tipe: "ewallet", saldoAwal: 0 });

    await repo.insertTx(buatTx({ tipe: "out", nominal: 20_000, tanggal: "2026-11-01", accountId: bca.id }));
    await repo.insertTx(buatTx({ tipe: "gaji", nominal: 1_000_000, tanggal: "2026-11-02", accountId: bca.id }));
    await repo.insertTx(buatTx({ tipe: "alokasi_gaji", nominal: 400_000, wadahTujuan: "tabungan", tanggal: "2026-11-02", accountId: bca.id }));
    await repo.insertTx(buatTx({ tipe: "in", nominal: 50_000, wadahTujuan: "saldo", tanggal: "2026-11-03", accountId: bca.id }));
    await repo.insertTx(buatTx({ tipe: "out", nominal: 10_000, tanggal: "2026-11-04" }));
    await pindahAkun(repo, "2026-11-04", { dariId: bca.id, keId: gopay.id, nominal: 30_000, tanggal: "2026-11-04" });

    const hasil = hitungAkun(await repo.load());
    expect(hasil.daftar.find((a) => a.id === bca.id)?.saldo).toBe(690_000);
    expect(hasil.daftar.find((a) => a.id === gopay.id)?.saldo).toBe(30_000);
    expect(hasil.total).toBe(720_000);
  });

  it("mencatat pengeluaran dari dompet pilihan", async () => {
    const repo = new MemRepo();
    const bca = await tambahAkun(repo, { nama: "BCA", tipe: "bank", saldoAwal: 0 });
    const gopay = await tambahAkun(repo, { nama: "GoPay", tipe: "ewallet", saldoAwal: 0 });

    await tambahTransaksi(repo, "2026-11-01", {
      tipe: "out",
      nominal: 25_000,
      tanggal: "2026-11-01",
      accountId: gopay.id,
    });

    const hasil = hitungAkun(await repo.load());
    expect(hasil.daftar.find((a) => a.id === bca.id)?.saldo).toBe(0);
    expect(hasil.daftar.find((a) => a.id === gopay.id)?.saldo).toBe(-25_000);
  });

  it("menghitung bonus otomatis sekali dan menolak transfer melebihi saldo", async () => {
    const repo = new MemRepo();
    const utama = await tambahAkun(repo, { nama: "Tunai", tipe: "tunai", saldoAwal: 0 });
    const lain = await tambahAkun(repo, { nama: "Bank", tipe: "bank", saldoAwal: 0 });

    const induk = await repo.insertTx(buatTx({ tipe: "bonus", nominal: 100_000, tanggal: "2026-11-01", accountId: utama.id }));
    await repo.insertTx(buatTx({ tipe: "bonus", nominal: 50_000, wadahTujuan: "saldo", tanggal: "2026-11-01", accountId: utama.id, indukId: induk }));

    expect(hitungAkun(await repo.load()).total).toBe(100_000);
    await expect(
      pindahAkun(repo, "2026-11-02", { dariId: lain.id, keId: utama.id, nominal: 1_000, tanggal: "2026-11-02" }),
    ).rejects.toThrow("kurang dari nominal");
  });
});
