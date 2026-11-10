import { buatSpreadsheet, googleSheetsSiap, refreshAccessToken, tulisSpreadsheet } from "@/lib/google-sheets";
import { dekripsiRefreshTokenGoogle, enkripsiRefreshTokenGoogle } from "@/lib/google-token";
import { wibDate } from "@/lib/parse/date";
import { getPool, PgRepo } from "@/lib/pg-repo";
import { bangunBarisSheets, kirimKeSheets, validasiUrlSheets } from "@/lib/sheets";
import { AksiError } from "@/lib/web-actions";

export type ModeSheets = "google" | "webhook" | null;

export interface StatusSheets {
  mode: ModeSheets;
  /** URL webhook Apps Script (mode cadangan). */
  url: string | null;
  spreadsheetUrl: string | null;
  email: string | null;
  terakhir: string | null;
  googleSiap: boolean;
}

interface KoneksiSheets {
  user_id: string;
  refresh_token_enc: string;
  spreadsheet_id: string;
  spreadsheet_url: string;
  email: string | null;
}

function kunciToken(): string {
  const nilai = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY?.trim() || process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!nilai) throw new AksiError("Kunci enkripsi token Google belum diatur.");
  return nilai;
}

async function ambilKoneksi(userId: string): Promise<KoneksiSheets | null> {
  try {
    const hasil = await getPool().query<KoneksiSheets>(
      "SELECT user_id, refresh_token_enc, spreadsheet_id, spreadsheet_url, email FROM google_sheets WHERE user_id = $1",
      [userId],
    );
    return hasil.rows[0] ?? null;
  } catch (error) {
    if ((error as { code?: string }).code === "42P01") return null;
    throw error;
  }
}

export async function statusSheets(userId: string): Promise<StatusSheets> {
  const [hasil, koneksi] = await Promise.all([
    getPool().query<{ kunci: string; nilai: string }>(
      "SELECT kunci, nilai FROM config WHERE user_id = $1 AND kunci IN ('sheets_url', 'sheets_terakhir')",
      [userId],
    ),
    ambilKoneksi(userId),
  ]);
  const peta = Object.fromEntries(hasil.rows.map((r) => [r.kunci, r.nilai]));
  const url = peta.sheets_url?.trim() || null;
  return {
    mode: koneksi ? "google" : url ? "webhook" : null,
    url,
    spreadsheetUrl: koneksi?.spreadsheet_url ?? null,
    email: koneksi?.email ?? null,
    terakhir: peta.sheets_terakhir?.trim() || null,
    googleSiap: googleSheetsSiap(),
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

export async function putusSheets(userId: string): Promise<StatusSheets> {
  try {
    await getPool().query("DELETE FROM google_sheets WHERE user_id = $1", [userId]);
  } catch (error) {
    if ((error as { code?: string }).code !== "42P01") throw error;
  }
  const repo = new PgRepo(undefined, undefined, userId);
  await repo.setConfig("sheets_url", "");
  await repo.setConfig("sheets_terakhir", "");
  return statusSheets(userId);
}

/** Menyimpan refresh token Google dan memakai spreadsheet yang sudah ada atau membuat baru. */
export async function simpanKoneksiSheets(
  userId: string,
  input: { refreshToken: string; accessToken: string; email: string | null },
): Promise<StatusSheets> {
  if (!input.refreshToken) throw new AksiError("Google tidak memberikan refresh token; coba hubungkan ulang.");
  const lama = await ambilKoneksi(userId);
  const akunSama = lama && (!lama.email || !input.email || lama.email === input.email);
  const sheet = akunSama
    ? { id: lama.spreadsheet_id, url: lama.spreadsheet_url }
    : await buatSpreadsheet(input.accessToken);

  const tokenEnc = enkripsiRefreshTokenGoogle(input.refreshToken, kunciToken());
  await getPool().query(
    `INSERT INTO google_sheets (user_id, refresh_token_enc, spreadsheet_id, spreadsheet_url, email)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id) DO UPDATE SET
       refresh_token_enc = EXCLUDED.refresh_token_enc,
       spreadsheet_id = EXCLUDED.spreadsheet_id,
       spreadsheet_url = EXCLUDED.spreadsheet_url,
       email = EXCLUDED.email,
       diperbarui_pada = now()`,
    [userId, tokenEnc, sheet.id, sheet.url, input.email],
  );
  const repo = new PgRepo(undefined, undefined, userId);
  await repo.setConfig("sheets_url", "");
  await repo.setConfig("sheets_terakhir", "");

  try {
    await sinkronSheets(userId);
  } catch (error) {
    console.error(`Sinkron awal Google Sheets gagal (user ${userId}): ${error instanceof Error ? error.message : "unknown"}`);
  }
  return statusSheets(userId);
}

export async function sinkronSheets(userId: string): Promise<{ baris: number; terakhir: string }> {
  const state = await new PgRepo(undefined, undefined, userId).load();
  const rows = bangunBarisSheets(state);
  const koneksi = await ambilKoneksi(userId);

  let baris: number;
  if (koneksi) {
    const accessToken = await refreshAccessToken(
      dekripsiRefreshTokenGoogle(koneksi.refresh_token_enc, kunciToken()),
    );
    baris = await tulisSpreadsheet(accessToken, koneksi.spreadsheet_id, rows);
  } else {
    const { url } = await statusSheets(userId);
    if (!url) throw new AksiError("Hubungkan Google Sheets atau simpan URL web app terlebih dahulu.");
    baris = await kirimKeSheets(url, rows, process.env.SHEETS_WEBHOOK_SECRET?.trim());
  }

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

/** Sinkron otomatis harian untuk semua user yang punya koneksi Google atau URL webhook. */
export async function prosesSinkronSheets(hariIni = wibDate(Date.now())): Promise<{ terkirim: number; dilewati: number; gagal: number }> {
  let rows: { user_id: string }[];
  try {
    const hasil = await getPool().query<{ user_id: string }>(
      `SELECT user_id FROM google_sheets
       UNION
       SELECT user_id FROM config WHERE kunci = 'sheets_url' AND user_id IS NOT NULL AND nilai <> ''`,
    );
    rows = hasil.rows;
  } catch (error) {
    if ((error as { code?: string }).code !== "42P01") throw error;
    const hasil = await getPool().query<{ user_id: string }>(
      "SELECT user_id FROM config WHERE kunci = 'sheets_url' AND user_id IS NOT NULL AND nilai <> ''",
    );
    rows = hasil.rows;
  }

  let terkirim = 0;
  let dilewati = 0;
  let gagal = 0;
  for (const row of rows) {
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
