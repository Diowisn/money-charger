import { describe, expect, it } from "vitest";
import { normalisasiNomorWa } from "@/lib/auth";

describe("nomor WhatsApp untuk tautan reset", () => {
  it("menormalkan nomor Indonesia ke format 62", () => {
    expect(normalisasiNomorWa("0812-3456-7890")).toBe("6281234567890");
    expect(normalisasiNomorWa("812 3456 7890")).toBe("6281234567890");
    expect(normalisasiNomorWa("+62 812 3456 7890")).toBe("6281234567890");
    expect(normalisasiNomorWa("")).toBe("");
  });
});
