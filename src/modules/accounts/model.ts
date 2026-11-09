import { catatAudit } from "@/lib/audit";
import { wibDate } from "@/lib/parse/date";
import { getPool, PgRepo } from "@/lib/pg-repo";
import { pindahAkun, tambahAkun, type InputAkun, type InputPindahAkun } from "@/lib/web-actions";

export async function pastikanAkunDefault(userId: string): Promise<void> {
  try {
    await getPool().query(
      `INSERT INTO accounts (user_id, nama, tipe, saldo_awal, urutan)
       SELECT $1, 'Dompet utama', 'tunai',
              COALESCE((SELECT NULLIF(nilai, '')::bigint FROM config WHERE user_id = $1 AND kunci = 'saldo_awal'), 0),
              1
       WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE user_id = $1)
       ON CONFLICT DO NOTHING`,
      [userId],
    );
  } catch (error) {
    if ((error as { code?: string }).code === "42P01") return;
    throw error;
  }
}

export async function tambahAkunFinance(input: InputAkun, userId: string) {
  const hasil = await tambahAkun(new PgRepo(undefined, undefined, userId), input);
  await catatAudit("web", "dompet_ditambah", { id: hasil.id });
  return hasil;
}

export async function pindahAkunFinance(input: InputPindahAkun, userId: string) {
  const hasil = await pindahAkun(new PgRepo(undefined, undefined, userId), wibDate(Date.now()), input);
  await catatAudit("web", "dompet_dipindah", { id: hasil.id });
  return hasil;
}
