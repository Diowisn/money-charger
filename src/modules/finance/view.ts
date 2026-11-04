import { bacaBody, galat, ok } from "@/lib/api";

export { bacaBody, galat, ok };

export function dashboard(data: unknown) {
  return Response.json(
    { ok: true, data },
    { headers: { "Cache-Control": "no-store" } },
  );
}
