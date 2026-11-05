import { describe, expect, it } from "vitest";
import { bangunDashboard, hitungTrenPengeluaran } from "@/lib/dashboard";
import { susunKonteksInsight, validasiPertanyaan } from "@/lib/insight";
import { MemRepo } from "@/lib/mem-repo";
import { buatTx } from "@/lib/types";

const HARI = "2026-11-05";

function repoBaru() {
  return new MemRepo(["628111"]);
}

describe("validasi pertanyaan asisten", () => {
  it("menolak pertanyaan kosong/pendek dan terlalu panjang", () => {
    expect(validasiPertanyaan("").ok).toBe(false);
    expect(validasiPertanyaan("hi").ok).toBe(false);
    expect(validasiPertanyaan(null).ok).toBe(false);
    expect(validasiPertanyaan("x".repeat(401))).toMatchObject({ ok: false });
  });

  it("menerima pertanyaan wajar dan memangkas spasi", () => {
    const r = validasiPertanyaan("  pos apa yang paling boros?  ");
    expect(r).toEqual({ ok: true, teks: "pos apa yang paling boros?" });
  });
});

describe("tren pengeluaran harian", () => {
  it("menghitung nominal + biaya admin, mengabaikan batal dan non-pengeluaran", async () => {
    const repo = repoBaru();
    await repo.insertTx(buatTx({ tipe: "out", nominal: 10_000, biayaAdmin: 2_500, tanggal: HARI, label: "kopi" }));
    await repo.insertTx(buatTx({ tipe: "out", nominal: 5_000, tanggal: "2026-10-30", label: "parkir" }));
    await repo.insertTx(buatTx({ tipe: "out", nominal: 99_999, tanggal: HARI, label: "batal", status: "batal" }));
    await repo.insertTx(buatTx({ tipe: "out", nominal: 77_000, tanggal: "2026-10-20", label: "terlalu lama" }));
    await repo.insertTx(buatTx({ tipe: "in", nominal: 50_000, tanggal: HARI, label: "masuk" }));

    const tren = hitungTrenPengeluaran(await repo.load(), HARI);
    expect(tren).toHaveLength(14);
    expect(tren[0].tanggal).toBe("2026-10-23");
    expect(tren.at(-1)).toEqual({ tanggal: HARI, pengeluaran: 12_500 });
    expect(tren.find((t) => t.tanggal === "2026-10-30")?.pengeluaran).toBe(5_000);
    expect(tren.reduce((s, t) => s + t.pengeluaran, 0)).toBe(17_500);
  });
});

describe("konteks insight untuk AI", () => {
  it("merangkum angka penting tanpa membocorkan nomor telepon", async () => {
    const repo = repoBaru();
    const state = await repo.load();
    const sub = state.subPosts[0];
    await repo.insertTx(
      buatTx({ tipe: "out", nominal: 25_000, biayaAdmin: 1_000, tanggal: HARI, subPostId: sub.id, label: "uji" }),
    );
    const data = bangunDashboard(await repo.load(), HARI);
    const konteks = susunKonteksInsight(data);

    expect(konteks).toContain("Hari ini: 2026-11-05");
    expect(konteks).toContain("Saldo");
    expect(konteks).toContain("Rencana");
    expect(konteks).toContain("Transaksi terakhir:");
    expect(konteks).toContain("Rp26.000");
    expect(konteks).toContain(sub.nama);
    expect(konteks).not.toContain("628111");
  });

  it("tetap menghasilkan konteks walau belum ada transaksi", async () => {
    const data = bangunDashboard(await repoBaru().load(), HARI);
    const konteks = susunKonteksInsight(data);
    expect(konteks.length).toBeGreaterThan(20);
    expect(konteks).toContain("Belum ada periode gaji aktif.");
    expect(konteks).not.toContain("Transaksi terakhir:");
  });
});
