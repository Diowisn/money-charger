import { describe, expect, it } from "vitest";
import type { DashboardData } from "@/lib/dashboard";
import { kunciMinggu, pesanMingguan, pesanPeringatan } from "@/modules/digest/model";

const data = {
  hariIni: "2026-11-09",
  ringkasan: { pengeluaranBulanIni: 1_500_000, sisaUang: 500_000, rasio: 0.75 },
  wawasan: {
    peringatan: ["Anggaran periode sudah terpakai 80%."],
    proyeksiPengeluaran: 2_000_000,
    proyeksiSaldo: 250_000,
  },
  otomatis: [
    { id: 1, nama: "Internet", nominal: 300_000, hari: 10, subPostId: null, subPost: null, aktif: true, mulai: "2026-01-01", terakhirJalan: null, berikutnya: "2026-11-10" },
    { id: 2, nama: "Listrik", nominal: 200_000, hari: 25, subPostId: null, subPost: null, aktif: true, mulai: "2026-01-01", terakhirJalan: null, berikutnya: "2026-11-25" },
  ],
} as unknown as DashboardData;

describe("digest WhatsApp", () => {
  it("memakai kunci minggu ISO yang sama untuk Senin sampai Minggu", () => {
    expect(kunciMinggu("2026-11-09")).toBe(kunciMinggu("2026-11-15"));
    expect(kunciMinggu("2026-11-16")).not.toBe(kunciMinggu("2026-11-15"));
    expect(kunciMinggu("2025-12-29")).toBe("2026-W01");
  });

  it("memuat ringkasan, proyeksi, dan hanya tagihan 7 hari ke depan", () => {
    const pesan = pesanMingguan(data);
    expect(pesan).toContain("Pengeluaran bulan ini: Rp1.500.000");
    expect(pesan).toContain("Sisa anggaran: Rp500.000 (25% tersisa)");
    expect(pesan).toContain("Proyeksi saldo akhir bulan: Rp250.000");
    expect(pesan).toContain("Internet Rp300.000 (10/11)");
    expect(pesan).not.toContain("Listrik");
  });

  it("menyusun peringatan dari wawasan", () => {
    expect(pesanPeringatan(data)).toBe("Peringatan Money-Charger\n- Anggaran periode sudah terpakai 80%.");
  });
});
