import { createHash } from "node:crypto";
import { getPool } from "./pg-repo";

export function aktorWeb(ip: string): string {
  return `web:${createHash("sha256").update(ip).digest("hex").slice(0, 16)}`;
}

const KUNCI_DETAIL_AMAN = new Set(["jenis", "pesanId", "provider", "status", "jumlah", "sumber"]);

export function sanitasiDetailAudit(detail: Record<string, unknown>): Record<string, string | number | boolean> {
  return Object.fromEntries(
    Object.entries(detail)
      .filter(([key, value]) => KUNCI_DETAIL_AMAN.has(key) && ["string", "number", "boolean"].includes(typeof value))
      .map(([key, value]) => [key, typeof value === "string" ? value.slice(0, 120) : value as number | boolean]),
  );
}

export async function catatAudit(aktor: string, aksi: string, detail: Record<string, unknown> = {}): Promise<void> {
  try {
    await getPool().query(
      `INSERT INTO audit_events (aktor, aksi, detail) VALUES ($1, $2, $3::jsonb)`,
      [aktor.slice(0, 120), aksi.slice(0, 120), JSON.stringify(sanitasiDetailAudit(detail))],
    );
  } catch {
    console.warn("Audit event gagal disimpan.");
  }
}
