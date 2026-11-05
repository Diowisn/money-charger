import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { retryOutbox } from "@/modules/outbox/controller";
import { terimaEmail } from "@/modules/email/controller";
import { health } from "@/modules/health/controller";
import { terimaWebhook } from "@/modules/whatsapp/controller";

const awal = {
  EMAIL_INBOUND_SECRET: process.env.EMAIL_INBOUND_SECRET,
  HEALTH_TOKEN: process.env.HEALTH_TOKEN,
  DATABASE_URL: process.env.DATABASE_URL,
  CRON_SECRET: process.env.CRON_SECRET,
};

afterEach(() => {
  for (const [k, v] of Object.entries(awal)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("proteksi endpoint operasional", () => {
  it("menolak secret email di query string", async () => {
    process.env.EMAIL_INBOUND_SECRET = "secret-uji";
    const req = new NextRequest("https://app.example/api/email/inbound?secret=secret-uji", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect((await terimaEmail(req)).status).toBe(401);
  });

  it("health tanpa token hanya mengembalikan status ringkas", async () => {
    delete process.env.HEALTH_TOKEN;
    delete process.env.DATABASE_URL;
    const res = await health(new NextRequest("https://app.example/api/health"));
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["ok", "waktu"]);
  });

  it("menolak webhook yang melampaui batas ukuran body", async () => {
    const body = "x".repeat(1024 * 1024 + 1);
    const req = new NextRequest("https://app.example/api/whatsapp/webhook", { method: "POST", body });
    expect((await terimaWebhook(req)).status).toBe(413);
  });

  it("melindungi pemroses outbox dengan CRON_SECRET", async () => {
    process.env.CRON_SECRET = "cron-uji";
    const req = new NextRequest("https://app.example/api/cron/outbox", { method: "POST" });
    expect((await retryOutbox(req)).status).toBe(401);
  });
});
