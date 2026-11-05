import { beforeEach, describe, expect, it } from "vitest";
import { batasi, ipDariRequest, resetBatasUntukUji } from "@/lib/rate-limit";

beforeEach(() => resetBatasUntukUji());

describe("pembatas laju", () => {
  it("mengizinkan sampai batas lalu menolak dengan waktu tunggu", () => {
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) {
      expect(batasi("uji", 3, 60_000, t).boleh).toBe(true);
    }
    const tolak = batasi("uji", 3, 60_000, t + 1);
    expect(tolak.boleh).toBe(false);
    expect(tolak.detikTunggu).toBeGreaterThan(0);
  });

  it("mengizinkan lagi setelah jendela berakhir", () => {
    expect(batasi("uji", 1, 1_000, 0).boleh).toBe(true);
    expect(batasi("uji", 1, 1_000, 500).boleh).toBe(false);
    expect(batasi("uji", 1, 1_000, 1_001).boleh).toBe(true);
  });

  it("memakai IP dari x-forwarded-for lebih dulu", () => {
    expect(ipDariRequest(new Request("https://x", { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } }))).toBe("1.2.3.4");
    expect(ipDariRequest(new Request("https://x", { headers: { "x-real-ip": "9.9.9.9" } }))).toBe("9.9.9.9");
    expect(ipDariRequest(new Request("https://x"))).toBe("lokal");
  });
});
