import { describe, expect, it } from "vitest";
import { getDashboard } from "@/modules/finance/controller";
import { dashboard } from "@/modules/finance/view";
import { deleteProfil, getProfil, patchProfil } from "@/modules/profile/controller";
import { NextRequest } from "next/server";



describe("controller HMVC", () => {
  it("dashboard menolak request tanpa sesi sebelum menyentuh model", async () => {
    const res = await getDashboard(new NextRequest("https://app.example/api/dashboard"));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ ok: false });
  });

  it("API profil menolak semua metode tanpa sesi", async () => {
    const url = "https://app.example/api/profile";
    const responses = await Promise.all([
      getProfil(new NextRequest(url)),
      patchProfil(new NextRequest(url, { method: "PATCH", body: "{}" })),
      deleteProfil(new NextRequest(url, { method: "DELETE", body: "{}" })),
    ]);

    for (const res of responses) {
      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toMatchObject({ ok: false });
    }
  });

  it("respons dashboard selalu tanpa cache", () => {
    const res = dashboard({ ringkasan: { saldo: 1 } });

    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("cdn-cache-control")).toBe("no-store");
    expect(res.headers.get("vercel-cdn-cache-control")).toBe("no-store");
  });
});
