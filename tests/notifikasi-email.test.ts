import { describe, expect, it } from "vitest";
import type { TxView } from "@/lib/dashboard";
import { transaksiEmailBaru } from "@/modules/finance/view/format";

const tx = (id: number, sumber?: string) =>
  ({ id, nominal: 10_000, detail: sumber ? { sumber } : null }) as TxView;

describe("notifikasi transaksi email", () => {
  it("hanya mengembalikan transaksi email yang belum dikenal", () => {
    const hasil = transaksiEmailBaru([tx(1), tx(2, "email"), tx(3, "email"), tx(4, "manual")], new Set([1, 3]));
    expect(hasil.map((item) => item.id)).toEqual([2]);
  });
});
