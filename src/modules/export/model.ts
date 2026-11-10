import { createHash } from "node:crypto";
import { buatCsv } from "@/lib/csv";
import { enkripsiEkspor } from "@/lib/export-enkripsi";
import { PgRepo } from "@/lib/pg-repo";

export async function buatEkspor(token: string, userId: string): Promise<string | null> {
  if (!/^[0-9a-f]{48}$/.test(token)) return null;
  const repo = new PgRepo(undefined, undefined, userId);
  const hash = createHash("sha256").update(token).digest("hex");
  if (!(await repo.consumeExport(hash, Date.now()))) return null;
  return buatCsv(await repo.load());
}

export async function buatEksporTerenkripsi(userId: string, password: string): Promise<Buffer> {
  if (password.length < 8) throw new Error("Password ekspor minimal 8 karakter.");
  const csv = buatCsv(await new PgRepo(undefined, undefined, userId).load());
  return enkripsiEkspor(csv, password);
}
