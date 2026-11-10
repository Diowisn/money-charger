import { describe, expect, it } from "vitest";
import { dekripsiRefreshTokenGoogle, enkripsiRefreshTokenGoogle } from "@/lib/google-token";

const KUNCI = "a".repeat(64);

describe("enkripsi refresh token Google", () => {
  it("bolak-balik mengembalikan token asli", () => {
    const token = "1//refresh-token-rahasia";
    const paket = enkripsiRefreshTokenGoogle(token, KUNCI);
    expect(paket).not.toContain(token);
    expect(paket.startsWith("g1.")).toBe(true);
    expect(dekripsiRefreshTokenGoogle(paket, KUNCI)).toBe(token);
  });

  it("menolak paket yang diubah atau kunci berbeda", () => {
    const paket = enkripsiRefreshTokenGoogle("token", KUNCI);
    expect(() => dekripsiRefreshTokenGoogle(`${paket}x`, KUNCI)).toThrow();
    expect(() => dekripsiRefreshTokenGoogle(paket, "b".repeat(64))).toThrow();
  });
});
