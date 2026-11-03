import { AksiError } from "./web-actions";

export async function bacaBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const b = await req.json();
    return b && typeof b === "object" ? (b as Record<string, unknown>) : {};
  } catch {
    throw new AksiError("Body permintaan tidak valid.");
  }
}

export function galat(e: unknown): Response {
  if (e instanceof AksiError) {
    return Response.json({ ok: false, error: e.message }, { status: 400 });
  }
  console.error(e);
  return Response.json({ ok: false, error: "Terjadi kesalahan pada server." }, { status: 500 });
}

export function ok(data: Record<string, unknown> = {}): Response {
  return Response.json({ ok: true, ...data }, { headers: { "Cache-Control": "no-store" } });
}
