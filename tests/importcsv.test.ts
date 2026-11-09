import { describe, expect, it } from "vitest";
import { nominalDariCsv, parseCsv, tanggalDariCsv } from "@/modules/importcsv/model";

describe("impor CSV", () => {
  it("membaca pemisah koma, titik koma, kutip, dan newline", () => {
    expect(parseCsv('tanggal,tipe,nominal\n2026-01-05,out,25000')).toEqual([
      ["tanggal", "tipe", "nominal"],
      ["2026-01-05", "out", "25000"],
    ]);
    expect(parseCsv('tanggal;label\n2026-01-05;"Kopi, susu"')).toEqual([
      ["tanggal", "label"],
      ["2026-01-05", "Kopi, susu"],
    ]);
  });

  it("menormalkan nominal rupiah dari berbagai format", () => {
    expect(nominalDariCsv("Rp25.000")).toBe(25_000);
    expect(nominalDariCsv("1.200.000")).toBe(1_200_000);
    expect(nominalDariCsv("25,000.00")).toBe(25_000);
    expect(nominalDariCsv("25.000,50")).toBe(25_000);
    expect(nominalDariCsv("150000")).toBe(150_000);
    expect(nominalDariCsv("-")).toBeNull();
  });

  it("membaca tanggal ISO dan Indonesia", () => {
    expect(tanggalDariCsv("2026-01-05")).toBe("2026-01-05");
    expect(tanggalDariCsv("05/01/2026")).toBe("2026-01-05");
    expect(tanggalDariCsv("5/1/26")).toBe("2026-01-05");
    expect(tanggalDariCsv("bukan tanggal")).toBeNull();
  });
});
