import type { State } from "./types";

export type BarisSheets = (string | number)[];

type SumberSheets = Pick<State, "txs" | "subPosts" | "accounts">;

function amanSheets(nilai: string | number | null): string | number {
  if (nilai === null) return "";
  if (typeof nilai === "number") return nilai;
  return /^[=+\-@\t\r]/.test(nilai) ? `'${nilai}` : nilai;
}

/** Baris siap tulis untuk Google Sheets: header + transaksi kronologis. */
export function bangunBarisSheets(state: SumberSheets): BarisSheets[] {
  const namaPos = (id: number | null) => (id ? state.subPosts.find((s) => s.id === id)?.nama ?? String(id) : "");
  const namaDompet = (id: number | null) => (id ? state.accounts.find((a) => a.id === id)?.nama ?? String(id) : "");
  const kepala = [
    "id",
    "tanggal",
    "tipe",
    "pos",
    "pos_tujuan",
    "label",
    "tags",
    "dompet",
    "dompet_tujuan",
    "nominal",
    "biaya_admin",
    "wadah_asal",
    "wadah_tujuan",
    "sumber",
    "status",
  ];
  const baris = [...state.txs]
    .sort((a, b) => a.tanggal.localeCompare(b.tanggal) || a.id - b.id)
    .map((t) =>
      [
        t.id,
        t.tanggal,
        t.tipe,
        namaPos(t.subPostId),
        namaPos(t.subPostIdTujuan),
        t.label ?? "",
        (t.tags ?? []).join(" "),
        namaDompet(t.accountId),
        namaDompet(t.accountIdTujuan),
        t.nominal,
        t.biayaAdmin ?? 0,
        t.wadahAsal ?? "",
        t.wadahTujuan ?? "",
        t.sumber,
        t.status,
      ].map(amanSheets),
    );
  return [kepala, ...baris];
}

/** Hanya menerima URL web app Google Apps Script agar server tidak bisa diarahkan ke host sembarang. */
export function validasiUrlSheets(nilai: string): string | null {
  let url: URL;
  try {
    url = new URL(nilai);
  } catch {
    return "URL tidak valid.";
  }
  if (url.protocol !== "https:") return "URL harus HTTPS.";
  if (url.hostname !== "script.google.com") return "Gunakan URL web app Google Apps Script (script.google.com).";
  if (!/^\/macros\/s\/[^/]+\/exec$/.test(url.pathname)) return "URL harus berupa web app yang berakhiran /exec.";
  return null;
}

export async function kirimKeSheets(url: string, rows: BarisSheets[], secret?: string): Promise<number> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(secret ? { "x-sheets-secret": secret } : {}),
    },
    body: JSON.stringify({ versi: 1, secret: secret ?? "", rows }),
    signal: AbortSignal.timeout(15_000),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Google Sheets menolak permintaan (HTTP ${res.status}).`);

  const teks = await res.text();
  let hasil: { ok?: boolean; error?: string } | null = null;
  try {
    hasil = JSON.parse(teks) as { ok?: boolean; error?: string };
  } catch {
    throw new Error("Respons Google Sheets tidak valid. Pastikan web app di-deploy untuk 'Anyone'.");
  }
  if (!hasil || hasil.ok !== true) throw new Error(hasil?.error ?? "Respons Google Sheets tidak dikenal.");
  return rows.length - 1;
}
