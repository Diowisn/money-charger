import { randomUUID } from "node:crypto";
import { authDikonfigurasi, buatTokenSesi, cocokkanPassword } from "@/lib/auth";
import { getPool } from "@/lib/pg-repo";

export function sudahDikonfigurasi(): boolean {
  return authDikonfigurasi();
}

export async function masuk(password: string): Promise<string | null> {
  if (!authDikonfigurasi() || !cocokkanPassword(password)) return null;
  return buatTokenSesi();
}

export async function cabutSemuaSesi(): Promise<void> {
  await getPool().query(
    `INSERT INTO config (kunci, nilai) VALUES ('session_epoch', $1)
     ON CONFLICT (kunci) DO UPDATE SET nilai = EXCLUDED.nilai`,
    [`${Date.now()}-${randomUUID()}`],
  );
}
