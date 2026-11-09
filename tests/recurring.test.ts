import { describe, expect, it } from "vitest";
import { berikutnyaJatuhTempo, jatuhTempo } from "@/modules/recurring/model";

describe("jadwal transaksi berulang", () => {
  it("memakai akhir bulan untuk tanggal 29-31", () => {
    expect(jatuhTempo({ hari: 31 }, "2026-02")).toBe("2026-02-28");
    expect(jatuhTempo({ hari: 31 }, "2028-02")).toBe("2028-02-29");
    expect(jatuhTempo({ hari: 31 }, "2026-04")).toBe("2026-04-30");
    expect(jatuhTempo({ hari: 5 }, "2026-01")).toBe("2026-01-05");
  });

  it("menghitung jatuh tempo berikutnya termasuk pergantian bulan dan tahun", () => {
    expect(berikutnyaJatuhTempo({ hari: 5, mulai: "2026-01-01" }, "2026-01-15")).toBe("2026-02-05");
    expect(berikutnyaJatuhTempo({ hari: 20, mulai: "2026-01-01" }, "2026-01-15")).toBe("2026-01-20");
    expect(berikutnyaJatuhTempo({ hari: 10, mulai: "2026-01-01" }, "2026-12-15")).toBe("2027-01-10");
  });

  it("tidak menjadwalkan sebelum tanggal mulai", () => {
    expect(berikutnyaJatuhTempo({ hari: 20, mulai: "2026-02-01" }, "2026-01-15")).toBe("2026-02-20");
  });
});
