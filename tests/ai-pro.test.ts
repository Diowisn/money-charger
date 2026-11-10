import { describe, expect, it } from "vitest";
import { bangunDashboard } from "@/lib/dashboard";
import { deteksiAnomali, susunKonteksRiwayat } from "@/lib/insight";
import { MemRepo } from "@/lib/mem-repo";
import { buatTx } from "@/lib/types";

const HARI = "2026-11-15";

async function repoRiwayat() {
  const repo = new MemRepo();
  const pos = (await repo.load()).subPosts[0];
  for (const [bulan, nominal] of [["2026-08", 100_000], ["2026-09", 110_000], ["2026-10", 90_000], ["2026-11", 500_000]] as const) {
    await repo.insertTx(buatTx({ tipe: "out", nominal, tanggal: `${bulan}-10`, subPostId: pos.id, label: "uji" }));
  }
  await repo.insertTx(buatTx({ tipe: "in", nominal: 2_000_000, tanggal: "2026-11-01", wadahTujuan: "saldo" }));
  return repo;
}

describe("AI Pro", () => {
  it("mendeteksi lonjakan bulanan dan kategori sebagai insight", async () => {
    const state = await (await repoRiwayat()).load();
    const anomali = deteksiAnomali(state, HARI);
    expect(anomali.some((item) => item.includes("Pengeluaran bulan ini"))).toBe(true);
    expect(anomali.some((item) => item.includes("lebih dari 2x"))).toBe(true);
  });

  it("menyusun konteks seluruh riwayat tanpa data mentah berlebihan", async () => {
    const state = await (await repoRiwayat()).load();
    const data = bangunDashboard(state, HARI);
    const konteks = susunKonteksRiwayat(state, data);
    expect(konteks).toContain("Riwayat seluruh bulan:");
    expect(konteks).toContain("- 2026-08:");
    expect(konteks).toContain("- 2026-11:");
    expect(konteks).toContain("Kategori pengeluaran sepanjang riwayat:");
    expect(konteks).toContain("Anomali terdeteksi:");
    expect(konteks).not.toContain("628111");
  });
});
