import { afterEach, describe, expect, it } from "vitest";
import { login } from "@/modules/auth/controller";
import { getDashboard } from "@/modules/finance/controller";
import { dashboard } from "@/modules/finance/view";
import { NextRequest } from "next/server";



describe("controller HMVC", () => {
  it("dashboard menolak request tanpa sesi sebelum menyentuh model", async () => {
    const res = await getDashboard(new NextRequest("https://app.example/api/dashboard"));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ ok: false });
  });

  it("respons dashboard selalu tanpa cache", () => {
    const res = dashboard({ ringkasan: { saldo: 1 } });

    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("cdn-cache-control")).toBe("no-store");
    expect(res.headers.get("vercel-cdn-cache-control")).toBe("no-store");
  });
});
