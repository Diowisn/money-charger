import { bacaBody, galat, ok } from "@/lib/api";

export { bacaBody, galat, ok };

const TANPA_CACHE = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  Pragma: "no-cache",
  Expires: "0",
};

export function dashboard(data: unknown) {
  return Response.json({ ok: true, data }, { headers: TANPA_CACHE });
}
