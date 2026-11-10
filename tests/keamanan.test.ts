import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, buatSecret, kodeTotp, verifikasiTotp } from "@/lib/totp";
import { dekripsiEkspor, enkripsiEkspor } from "@/lib/export-enkripsi";
import { otpauthUri } from "@/lib/totp";

describe("TOTP 2FA", () => {
  it("base32 bolak-balik dan kode 6 digit", () => {
    const buf = Buffer.from("money-charger");
    expect(base32Decode(base32Encode(buf)).equals(buf)).toBe(true);
    const secret = buatSecret();
    expect(otpauthUri("owner@example.com", secret)).toContain("issuer=Money-Charger");
    const kode = kodeTotp(secret, 1_700_000_000_000);
    expect(kode).toMatch(/^\d{6}$/);
    expect(verifikasiTotp(secret, kode, 1_700_000_000_000)).toBe(true);
    expect(verifikasiTotp(secret, "000000", 1_700_000_000_000, 0)).toBe(kode === "000000");
  });
});

describe("ekspor terenkripsi", () => {
  it("bisa didekripsi dengan password yang sama dan gagal dengan password lain", () => {
    const isi = "tanggal,tipe,nominal\n2026-11-01,out,25000\n";
    const paket = enkripsiEkspor(isi, "rahasia-panjang");
    expect(paket.toString("utf8").startsWith("MCENC1")).toBe(true);
    expect(dekripsiEkspor(paket, "rahasia-panjang")).toBe(isi);
    expect(() => dekripsiEkspor(paket, "password-salah")).toThrow();
  });
});
