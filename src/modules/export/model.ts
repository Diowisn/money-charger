import { createHash } from "node:crypto";
import { buatCsv } from "@/lib/csv";
import { PgRepo } from "@/lib/pg-repo";

export async function buatEkspor(token: string, userId: string): Promise<string | null> {
  if (!/^[0-9a-f]{48}$/.test(token)) return null;
  const repo = new PgRepo(undefined, undefined, userId);
  const hash = createHash("sha256").update(token).digest("hex");
  if (!(await repo.consumeExport(hash, Date.now()))) return null;
  return buatCsv(await repo.load());
}
