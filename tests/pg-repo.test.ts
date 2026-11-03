import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { hitungWadah } from "@/lib/engine";
import { tanganiPesan } from "@/lib/handler";
import { PgRepo } from "@/lib/pg-repo";

/** Menjalankan PgRepo (SQL asli) di atas Postgres tertanam supaya skema dan query teruji tanpa DBMS. */
const OWNER = "628111";
let db: PGlite;
let repo: PgRepo;
let n = 0;
const at = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d, 5, 0);
};
const kirim = (teks: string, tgl: string, id = `wamid.${++n}`) =>
  tanganiPesan(repo, { ai: null, baseUrl: "https://uji", now: () => at(tgl) }, { id, from: OWNER, type: "text", text: teks, timestampMs: at(tgl) });

beforeAll(async () => {
  db = new PGlite({ parsers: { 20: (v: string) => Number(v), 1082: (v: string) => v } });
  const adapter = {
    query: async (text: string, params?: unknown[]) => {
      const r = await db.query(text, params as any[]);
      return { rows: r.rows as any[], rowCount: r.affectedRows ? r.affectedRows : r.rows.length };
    },
  };
  await db.exec(readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8"));
  await db.exec(readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8")); // idempoten
  repo = new PgRepo(adapter, true);
  expect(await repo.seed([OWNER])).toBe(true);
  expect(await repo.seed([OWNER])).toBe(false); // seed tidak menggandakan data
});

describe("PgRepo di Postgres sungguhan", () => {
  it("seed Draft 1 dan alias benar", async () => {
    const s = await repo.load();
    expect(s.subPosts).toHaveLength(6);
    expect(s.plans[0].items.reduce((a, i) => a + i.nominal, 0)).toBe(1_800_000);
    expect(s.config.bonusSubPostId).not.toBeNull();
  });

  it("alur lengkap: setup, gaji, out, bonus, duplikat, whitelist, penutupan periode", async () => {
    await kirim("setup 17/10 saldo 300rb tabungan 0 investasi 0", "2026-10-17");
    await kirim("out 25rb bensin", "2026-10-17");
    await kirim("gaji masuk 1.8 juta", "2026-10-31");
    expect(await kirim("out 25rb kopi", "2026-11-02", "wamid.DUP")).toContain("Sisa jatah Jajan / Kopi / Self-Reward: Rp125.000");
    expect(await kirim("out 25rb kopi", "2026-11-02", "wamid.DUP")).toBeNull();
    await kirim("bonus 150001", "2026-11-05");
    await kirim("hapus terakhir", "2026-11-05");
    await kirim("out 40rb entah apa", "2026-11-06");
    expect(await kirim("ortu", "2026-11-06")).toContain("Dipetakan ke Uang Orang Tua.");
    await kirim("set makan 400rb", "2026-11-07");
    await kirim("gaji masuk 1.8 juta", "2026-11-30");
    const w = hitungWadah(await repo.load());
    // sisa periode 1 = 1.200.000 - 25.000 - 40.000 + DD 100.000 = 1.235.000 ; Saldo = 275.000 + 1.235.000 = 1.510.000
    // set makan 400rb membuat total rencana 1.850.000, jadi gaji 1.800.000 kurang 50.000 -> Saldo -50.000 (AC-10)
    expect(w).toEqual({ saldo: 1_460_000, tabungan: 800_000, investasi: 200_000 });
    expect(await tanganiPesan(repo, { ai: null }, { id: "x", from: "62999", type: "text", text: "saldo", timestampMs: at("2026-11-30") })).toBeNull();
  });

  it("ekspor sekali pakai dan kedaluwarsa", async () => {
    const r = (await kirim("ekspor", "2026-12-01"))!;
    const token = /t=([0-9a-f]{48})/.exec(r)![1];
    const { createHash } = await import("node:crypto");
    const hash = createHash("sha256").update(token).digest("hex");
    expect(await repo.consumeExport(hash, at("2026-12-01") + 60_000)).toBe(true);
    expect(await repo.consumeExport(hash, at("2026-12-01") + 60_000)).toBe(false);
  });

  it("konfirmasi gaji ganda dan hapus gaji bekerja lewat pending_actions", async () => {
    await kirim("gaji masuk 1.8 juta", "2026-12-05"); // < 20 hari dari gaji 30/11
    expect(await kirim("ya", "2026-12-05")).toContain("Gaji Rp1.800.000 dicatat");
    await kirim("hapus terakhir", "2026-12-05");
    expect(await kirim("ya", "2026-12-05")).toContain("terbuka kembali");
  });
});
