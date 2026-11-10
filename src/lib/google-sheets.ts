import type { BarisSheets } from "./sheets";

const NAMA_SHEET = "Transaksi";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

export function googleSheetsSiap(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());
}

function kredensial() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new Error("Google OAuth belum dikonfigurasi.");
  return { clientId, clientSecret };
}

async function bacaGalat(res: Response, pesan: string): Promise<Error> {
  const teks = await res.text().catch(() => "");
  return new Error(`${pesan} (HTTP ${res.status})${teks ? `: ${teks.slice(0, 200)}` : ""}`);
}

export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const { clientId, clientSecret } = kredensial();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw await bacaGalat(res, "Gagal memperbarui token Google; hubungkan ulang.");
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("Google tidak mengembalikan access token.");
  return data.access_token;
}

export async function buatSpreadsheet(
  accessToken: string,
  judul = "Money-Charger",
): Promise<{ id: string; url: string }> {
  const res = await fetch(SHEETS_API, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      properties: { title: judul },
      sheets: [{ properties: { title: NAMA_SHEET } }],
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw await bacaGalat(res, "Gagal membuat spreadsheet Google.");
  const data = (await res.json()) as { spreadsheetId?: string; spreadsheetUrl?: string };
  if (!data.spreadsheetId) throw new Error("Google tidak mengembalikan ID spreadsheet.");
  return {
    id: data.spreadsheetId,
    url: data.spreadsheetUrl ?? `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}/edit`,
  };
}

export async function tulisSpreadsheet(
  accessToken: string,
  spreadsheetId: string,
  rows: BarisSheets[],
): Promise<number> {
  const dasar = `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}`;
  const range = encodeURIComponent(`${NAMA_SHEET}!A1:ZZ`);

  const hapus = await fetch(`${dasar}/values/${range}:clear`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: "{}",
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!hapus.ok) throw await bacaGalat(hapus, "Gagal membersihkan spreadsheet Google.");

  const tulis = await fetch(
    `${dasar}/values/${encodeURIComponent(`${NAMA_SHEET}!A1`)}?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ values: rows }),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!tulis.ok) throw await bacaGalat(tulis, "Gagal menulis spreadsheet Google.");
  return rows.length - 1;
}
