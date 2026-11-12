import { describe, expect, it } from "vitest";
import { buatKodePemulihan, hashKodePemulihan, normalkanKodePemulihan } from "@/lib/recovery-code";

describe("kode pemulihan 2FA", () => {
  it("membuat kode unik berformat XXXXX-XXXXX", () => {
    const kode = buatKodePemulihan();
    expect(kode).toHaveLength(10);
    expect(new Set(kode).size).toBe(10);
    for (const item of kode) expect(item).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
  });

  it("menormalkan huruf kecil, spasi, dan tanda hubung", () => {
    expect(normalkanKodePemulihan("abcde-23456")).toBe("ABCDE23456");
    expect(normalkanKodePemulihan("ABCDE 23456")).toBe("ABCDE23456");
    expect(hashKodePemulihan("ABCDE-23456")).toBe(hashKodePemulihan("abcde 23456"));
  });
});
