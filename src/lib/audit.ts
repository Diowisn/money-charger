import { createHash } from "node:crypto";
import { getPool } from "./pg-repo";

export function aktorWeb(ip: string): string {
  return `web:${createHash("sha256").update(ip).digest("hex").slice(0, 16)}`;
}

export async function catatAudit(aktor: string, aksi: string, detail: Record<string, unknown> = {}): Promise<void> {
  try {
    await getPool().query(
      `INSERT INTO audit_events (aktor, aksi, detail) VALUES ($1, $2, $3::jsonb)`,
      [aktor.slice(0, 120), aksi.slice(0, 120), JSON.stringify(detail)],
    );
  } catch {
    console.warn("Audit event gagal disimpan.");
  }
}
