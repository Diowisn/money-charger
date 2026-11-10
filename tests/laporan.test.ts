import { describe, expect, it } from "vitest";
import { bangunLaporan, periodeLaporanTerakhir, teksLaporan, validasiPeriode } from "@/lib/laporan";
import { MemRepo } from "@/lib/mem-repo";
import { kunciMinggu } from "@/lib/parse/date";
import { buatTx } from "@/lib/types";

async function stateContoh() {
  const repo = new MemRepo();
  await repo.insertTx(buatTx({ tipe: "in", nominal: 100_000, tanggal: "2026-11-02", wadahTujuan: "saldo" }));
  await repo.insertTx(buatTx({ tipe: "out", nominal: 25_000, biayaAdmin: 2_500, tanggal: "2026-11-03", subPostId: 1, label: "makan" }));
  await repo.insertTx(buatTx({ tipe: "out", nominal: 10_000, tanggal: "2026-11-04", subPostId: 1, status: "batal" }));
  await repo.insertTx(buatTx({ tipe: "alokasi_gaji", nominal: 50_000, tanggal: "2026-11-05", wadahTujuan: "tabungan" }));
  return repo.load();
}

describe("laporan periode kustom", () => {
  it("memakai bulan berjalan sebagai bawaan dan menolak periode tidak sah", () => {
    expect(validasiPeriode(null, null, "2026-11-10")).toEqual({ dari: "2026-11-01", sampai: "2026-11-10" });
    expect(() => validasiPeriode("2026-11-10", "2026-11-01", "2026-11-10")).toThrow("Tanggal mulai");
    expect(() => validasiPeriode("2026-11-01", "2026-11-20", "2026-11-10")).toThrow("masa depan");
  });

  it("menghitung pemasukan, pengeluaran, biaya admin, dan kategori", async () => {
    const laporan = bangunLaporan(await stateContoh(), "2026-11-01", "2026-11-30");

    expect(laporan.jumlahHari).toBe(30);
    expect(laporan.ringkasan).toMatchObject({
      masuk: 100_000,
      keluar: 27_500,
      biayaAdmin: 2_500,
      bersih: 72_500,
      jumlahTransaksi: 2,
    });
    expect(laporan.kategori).toHaveLength(1);
    expect(laporan.kategori[0]).toMatchObject({ nama: "Bensin & Parkir", total: 27_500, jumlah: 1, porsi: 1 });
    expect(laporan.transaksi.map((t) => t.tipe)).toEqual(["out", "in"]);
  });

  it("mengabaikan transaksi batal dan turunan, serta membatasi rentang tanggal", async () => {
    const state = await stateContoh();
    const laporan = bangunLaporan(state, "2026-11-03", "2026-11-03");
    expect(laporan.ringkasan.masuk).toBe(0);
    expect(laporan.ringkasan.keluar).toBe(27_500);
    expect(laporan.ringkasan.jumlahTransaksi).toBe(1);
  });

  it("menyusun teks ringkas untuk WhatsApp/email", async () => {
    const teks = teksLaporan(bangunLaporan(await stateContoh(), "2026-11-01", "2026-11-30"));
    expect(teks).toContain("Laporan Money-Charger 01/11 - 30/11");
    expect(teks).toContain("Pengeluaran: Rp27.500");
    expect(teks).toContain("Arus bersih: Rp72.500");
    expect(teks).toContain("- Bensin & Parkir: Rp27.500 (100%)");
  });
});

describe("periode laporan terjadwal", () => {
  it("bulanan memakai bulan kalender sebelumnya", () => {
    expect(periodeLaporanTerakhir("bulanan", "2026-11-10")).toEqual({
      dari: "2026-10-01",
      sampai: "2026-10-31",
      kunci: "2026-10",
    });
  });

  it("mingguan memakai pekan Senin-Minggu yang sudah lengkap", () => {
    const selasa = periodeLaporanTerakhir("mingguan", "2026-11-10");
    expect(selasa).toEqual({ dari: "2026-11-02", sampai: "2026-11-08", kunci: kunciMinggu("2026-11-02") });
    expect(periodeLaporanTerakhir("mingguan", "2026-11-15")).toEqual(selasa);
    expect(periodeLaporanTerakhir("mingguan", "2026-11-16").dari).toBe("2026-11-09");
  });
});
