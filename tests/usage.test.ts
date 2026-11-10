import { describe, expect, it } from "vitest";
import { kunciPemakaian } from "@/lib/usage";

describe("meter pemakaian", () => {
  it("kunci counter per bulan dan jenis", () => {
    expect(kunciPemakaian("ai_parse", "2026-11")).toBe("usage:2026-11:ai_parse");
    expect(kunciPemakaian("ai_vision", "2026-12")).toBe("usage:2026-12:ai_vision");
    expect(kunciPemakaian("ai_insight", "2027-01")).toBe("usage:2027-01:ai_insight");
  });
});
