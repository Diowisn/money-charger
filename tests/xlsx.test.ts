import { Workbook } from "exceljs";
import { describe, expect, it } from "vitest";
import type { TxView } from "@/lib/dashboard";
import { buatXlsx } from "@/lib/xlsx";

const txs: TxView[] = [
  { id: 1, tipe: "out", nominal: 25000, biayaAdmin: 2500, tanggal: "2025-11-02", label: "makan", tags: [], subPost: "Makan", subPostId: 1, accountId: null, wadahAsal: null, wadahTujuan: null, status: "berlaku", bisaDihapus: true },
  { id: 2, tipe: "in", nominal: 100000, biayaAdmin: 0, tanggal: "2025-11-03", label: "bonus", tags: [], subPost: null, subPostId: null, accountId: null, wadahAsal: null, wadahTujuan: "saldo", status: "berlaku", bisaDihapus: true },
  { id: 3, tipe: "out", nominal: 5000, biayaAdmin: 0, tanggal: "2025-10-30", label: "batal", tags: [], subPost: "Lain", subPostId: 3, accountId: null, wadahAsal: null, wadahTujuan: null, status: "batal", bisaDihapus: false },
];

describe("ekspor xlsx", () => {
  it("memisahkan sheet per bulan dan menghitung total", async () => {
    const wb = await buatXlsx(txs, { out: "Pengeluaran", in: "Pemasukan" });
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Ringkasan", "Per kategori", "Okt 2025", "Nov 2025", "Dibatalkan"]);

    const november = wb.getWorksheet("Nov 2025");
    expect(november?.getCell(6, 3).value).toBe("Pengeluaran");
    expect(november?.getCell(6, 6).value).toBe(25000);
    expect(november?.getCell(8, 6).value).toBe(100000);
    expect(november?.getCell(9, 6).value).toBe(25000);
    expect(november?.getCell(10, 7).value).toBe(2500);
    expect(november?.getCell(11, 6).value).toBe(72500);

    const batal = wb.getWorksheet("Dibatalkan");
    expect(batal?.getCell(6, 7).value).toBe(5000);
    expect(wb.getWorksheet("Okt 2025")?.getCell(6, 1).value).toBe("Tidak ada transaksi berlaku pada bulan ini.");
  });

  it("menghasilkan file xlsx yang bisa dibuka ulang", async () => {
    const wb = await buatXlsx(txs, { out: "Pengeluaran", in: "Pemasukan" });
    const buf = await wb.xlsx.writeBuffer();
    const loaded = new Workbook();
    await loaded.xlsx.load(buf);
    expect(loaded.worksheets.map((w) => w.name)).toEqual(["Ringkasan", "Per kategori", "Okt 2025", "Nov 2025", "Dibatalkan"]);
  });
});
