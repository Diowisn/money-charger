import { bangunBarisSheets, kirimKeSheets, validasiUrlSheets } from "@/lib/sheets";
import { wibDate } from "@/lib/parse/date";
import { getPool, PgRepo } from "@/lib/pg-repo";
import { AksiError } from "@/lib/web-actions";

export interface StatusSheets {
  url: string | null;
  terakhir: string | null;
}

export async function statusSheets(userId: string): Promise<StatusSheets> {
  const hasil = await getPool().query<{ kunci: string; nilai: string }>(
    "SELECT kunci, nilai FROM config WHERE user_id = $1 AND kunci IN ('sheets_url', 'sheets_terakhir')",
    [userId],
  );
  const peta = Object.fromEntries(hasil.rows.map((r) => [r.kunci, r.nilai]));
  return {
    url: peta.sheets_url?.trim() || null,
    terakhir: peta.sheets_terakhir?.trim() || null,
  };
}

export async function simpanSheets(userId: string, nilai: unknown): Promise<StatusSheets> {
  const url = typeof nilai === "string" ? nilai.trim() : "";
  if (url) {
    const galat = validasiUrlSheets(url);
    if (galat) throw new AksiError(galat);
  }
  await new PgRepo(undefined, undefined, userId).setConfig("sheets_url", url);
  return statusSheets(userId);
}

export async function sinkronSheets(userId: string): Promise<{ baris: number; terakhir: string }> {
  const { url } = await statusSheets(userId);
  if (!url) throw new AksiError("Simpan URL Google Sheets terlebih dahulu.");

  const state = await new PgRepo(undefined, undefined, userId).load();
  const rows = bangunBarisSheets(state);
  const baris = await kirimKeSheets(url, rows, process.env.SHEETS_WEBHOOK_SECRET?.trim());
  const terakhir = new Date().toISOString();
  await new PgRepo(undefined, undefined, userId).setConfig("sheets_terakhir", terakhir);
  return { baris, terakhir };
}

/** Benar bila stempel ISO `terakhir` jatuh pada hari WIB yang sama dengan `hariIni`. */
export function sudahSinkronHariIni(terakhir: string | null, hariIni: string): boolean {
  if (!terakhir) return false;
  const ms = Date.parse(terakhir);
  return Number.isFinite(ms) && wibDate(ms) === hariIni;
}

/** Sinkron otomatis harian untuk semua user yang punya URL; maksimal sekali per hari WIB. */
export async function prosesSinkronSheets(hariIni = wibDate(Date.now())): Promise<{ terkirim: number; dilewati: number; gagal: number }> {
  const hasil = await getPool().query<{ user_id: string; nilai: string }>(
    "SELECT user_id, nilai FROM config WHERE kunci = 'sheets_url' AND user_id IS NOT NULL AND nilai <> ''",
  );
  let terkirim = 0;
  let dilewati = 0;
  let gagal = 0;
  for (const row of hasil.rows) {
    try {
      const { terakhir } = await statusSheets(row.user_id);
      if (sudahSinkronHariIni(terakhir, hariIni)) {
        dilewati += 1;
        continue;
      }
      await sinkronSheets(row.user_id);
      terkirim += 1;
    } catch (error) {
      gagal += 1;
      console.error(`Sinkron Sheets gagal (user ${row.user_id}): ${error instanceof Error ? error.message : "unknown"}`);
    }
  }
  return { terkirim, dilewati, gagal };
}
