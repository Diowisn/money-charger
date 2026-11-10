import { describe, expect, it } from "vitest";
import { bangunBarisSheets, validasiUrlSheets } from "@/lib/sheets";
import { sudahSinkronHariIni } from "@/modules/sheets/model";
import type { State } from "@/lib/types";

const state = {
  accounts: [{ id: 1, nama: "BCA", tipe: "bank", saldoAwal: 0, urutan: 1, aktif: true }],
  subPosts: [{ id: 10, groupId: 1, nama: "Listrik", kategori: null, aktif: true, urutan: 1 }],
  txs: [
    {
      id: 2,
      tipe: "in",
      nominal: 1_000_000,
      biayaAdmin: 0,
      subPostId: null,
      subPostIdTujuan: null,
      wadahAsal: null,
      wadahTujuan: "saldo",
      accountId: 1,
      accountIdTujuan: null,
      tanggal: "2026-11-05",
      label: "Gaji",
      detail: null,
      sumber: "kaku",
      status: "berlaku",
      penggantiDari: null,
      indukId: null,
      planVersionId: null,
      waMessageId: null,
    },
    {
      id: 1,
      tipe: "out",
      nominal: 250_000,
      biayaAdmin: 2_500,
      subPostId: 10,
      subPostIdTujuan: null,
      wadahAsal: "saldo",
      wadahTujuan: null,
      accountId: 1,
      accountIdTujuan: null,
      tanggal: "2026-11-02",
      label: "=SUM(A1:A2)",
      detail: null,
      sumber: "kaku",
      status: "berlaku",
      penggantiDari: null,
      indukId: null,
      planVersionId: null,
      waMessageId: null,
    },
  ],
} as unknown as State;

describe("sinkron Google Sheets", () => {
  it("menyusun header dan transaksi kronologis dengan nama pos/dompet", () => {
    const rows = bangunBarisSheets(state);
    expect(rows[0]).toEqual([
      "id",
      "tanggal",
      "tipe",
      "pos",
      "pos_tujuan",
      "label",
      "dompet",
      "dompet_tujuan",
      "nominal",
      "biaya_admin",
      "wadah_asal",
      "wadah_tujuan",
      "sumber",
      "status",
    ]);
    expect(rows[1]).toEqual([
      1,
      "2026-11-02",
      "out",
      "Listrik",
      "",
      "'=SUM(A1:A2)",
      "BCA",
      "",
      250_000,
      2_500,
      "saldo",
      "",
      "kaku",
      "berlaku",
    ]);
    expect(rows[2]?.[0]).toBe(2);
  });

  it("sinkron harian dilewati bila sudah sinkron pada hari WIB yang sama", () => {
    expect(sudahSinkronHariIni(null, "2026-11-10")).toBe(false);
    expect(sudahSinkronHariIni("2026-11-10T01:00:00.000Z", "2026-11-10")).toBe(true);
    expect(sudahSinkronHariIni("2026-11-09T16:59:00.000Z", "2026-11-10")).toBe(false);
    expect(sudahSinkronHariIni("2026-11-09T17:00:00.000Z", "2026-11-10")).toBe(true);
    expect(sudahSinkronHariIni("bukan tanggal", "2026-11-10")).toBe(false);
  });

  it("hanya menerima URL web app Apps Script", () => {
    expect(validasiUrlSheets("https://script.google.com/macros/s/AKfy/exec")).toBeNull();
    expect(validasiUrlSheets("http://script.google.com/macros/s/AKfy/exec")).toContain("HTTPS");
    expect(validasiUrlSheets("https://example.com/exec")).toContain("script.google.com");
    expect(validasiUrlSheets("https://script.google.com/macros/s/AKfy")).toContain("/exec");
    expect(validasiUrlSheets("bukan url")).toContain("tidak valid");
  });
});
