import { afterEach, describe, expect, it } from "vitest";
import { login } from "@/modules/auth/controller";
import { getDashboard } from "@/modules/finance/controller";
import { NextRequest } from "next/server";

const passwordAwal = process.env.DASHBOARD_PASSWORD;
const secretAwal = process.env.AUTH_SECRET;

afterEach(() => {
  if (passwordAwal === undefined) delete process.env.DASHBOARD_PASSWORD;
  else process.env.DASHBOARD_PASSWORD = passwordAwal;
  if (secretAwal === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = secretAwal;
});

describe("controller HMVC", () => {
  it("login memberi respons konfigurasi yang jelas bila password belum diatur", async () => {
    delete process.env.DASHBOARD_PASSWORD;
    const res = await login(new Request("https://app.example/api/auth/login", { method: "POST" }));

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      error: "DASHBOARD_PASSWORD belum diatur di server.",
    });
  });

  it("login sukses membuat cookie sesi httpOnly", async () => {
    process.env.DASHBOARD_PASSWORD = "password-uji-yang-cukup-kuat";
    process.env.AUTH_SECRET = "secret-uji";
    const res = await login(
      new Request("https://app.example/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: process.env.DASHBOARD_PASSWORD }),
      }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("HttpOnly");
  });

  it("dashboard menolak request tanpa sesi sebelum menyentuh model", async () => {
    const res = await getDashboard(new NextRequest("https://app.example/api/dashboard"));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ ok: false });
  });
});
