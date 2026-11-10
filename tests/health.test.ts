import { describe, expect, it } from "vitest";
import { cronBasi } from "@/modules/health/model";

const SEKARANG = Date.parse("2026-11-10T12:00:00.000Z");

describe("status cron di health", () => {
  it("belum pernah berjalan dianggap masalah", () => {
    expect(cronBasi(null, SEKARANG)).toContain("belum pernah");
  });

  it("cron dalam 26 jam dianggap sehat", () => {
    expect(cronBasi("2026-11-10T00:00:00.000Z", SEKARANG)).toBeNull();
    expect(cronBasi("2026-11-09T11:00:00.000Z", SEKARANG)).toBeNull();
  });

  it("cron lebih dari 26 jam dianggap basi", () => {
    expect(cronBasi("2026-11-09T09:00:00.000Z", SEKARANG)).toContain("jam lalu");
  });

  it("nilai tidak valid dilaporkan", () => {
    expect(cronBasi("bukan tanggal", SEKARANG)).toContain("tidak valid");
  });
});
