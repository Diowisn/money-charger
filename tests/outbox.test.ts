import { describe, expect, it } from "vitest";
import { jedaUlang } from "@/lib/outbox";

describe("jadwal retry outbox", () => {
  it("menerapkan backoff bertahap dan membatasi percobaan", () => {
    expect(jedaUlang(1)).toBe(60_000);
    expect(jedaUlang(2)).toBe(5 * 60_000);
    expect(jedaUlang(3)).toBe(15 * 60_000);
    expect(jedaUlang(4)).toBe(60 * 60_000);
    expect(jedaUlang(5)).toBe(6 * 60 * 60_000);
    expect(jedaUlang(99)).toBe(6 * 60 * 60_000);
  });
});
