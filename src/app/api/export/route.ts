import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { buatCsv } from "@/lib/csv";
import { PgRepo } from "@/lib/pg-repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Unduh CSV. Token acak, berlaku 15 menit, sekali pakai (NFR-10). */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("t") ?? "";
  if (!/^[0-9a-f]{48}$/.test(token)) return new Response("Not found", { status: 404 });

  const repo = new PgRepo();
  const hash = createHash("sha256").update(token).digest("hex");
  if (!(await repo.consumeExport(hash, Date.now()))) return new Response("Not found", { status: 404 });

  const csv = buatCsv(await repo.load());
  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="money-charger-transaksi.csv"',
      "cache-control": "no-store",
    },
  });
}
