import { afterEach, describe, expect, it, vi } from "vitest";
import { buatGroqClient } from "@/lib/ai";

afterEach(() => vi.unstubAllGlobals());

describe("failover model Groq", () => {
  it("mencoba model cadangan bila model utama tidak ditemukan", async () => {
    const ambil = vi.fn()
      .mockResolvedValueOnce(new Response("{}", { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ intent: "out", amount_text: "25rb", sub_pos: null }) } }],
      }), { status: 200 }));
    vi.stubGlobal("fetch", ambil);

    const client = buatGroqClient({
      NODE_ENV: "test",
      GROQ_API_KEY: "test-key",
      GROQ_MODEL: "model-utama",
      GROQ_FALLBACK_MODELS: "model-cadangan",
    });
    const hasil = await client!.parse("kopi 25rb", []);

    expect(hasil?.intent).toBe("out");
    expect(ambil).toHaveBeenCalledTimes(2);
    expect(JSON.parse(ambil.mock.calls[0][1].body).model).toBe("model-utama");
    expect(JSON.parse(ambil.mock.calls[1][1].body).model).toBe("model-cadangan");
  });

  it("tidak mencoba model cadangan setelah 429", async () => {
    const ambil = vi.fn().mockResolvedValue(new Response("{}", { status: 429 }));
    vi.stubGlobal("fetch", ambil);
    const client = buatGroqClient({
      NODE_ENV: "test",
      GROQ_API_KEY: "test-key",
      GROQ_MODEL: "model-utama",
      GROQ_FALLBACK_MODELS: "model-cadangan",
    });

    expect(await client!.parse("kopi 25rb", [])).toBeNull();
    expect(ambil).toHaveBeenCalledTimes(1);
  });
});
