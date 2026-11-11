import { createHash, createHmac } from "node:crypto";

/** Baris transaksi apa adanya dari Postgres. */
export type BarisLedger = Record<string, unknown>;

export interface HasilLedger {
  ok: boolean;
  jumlah: number;
  akar: string | null;
  rusak: number | null;
}

function kanonik(nilai: unknown): unknown {
  if (Array.isArray(nilai)) return nilai.map(kanonik);
  if (nilai && typeof nilai === "object") {
    return Object.fromEntries(
      Object.keys(nilai as Record<string, unknown>)
        .sort()
        .map((k) => [k, kanonik((nilai as Record<string, unknown>)[k])]),
    );
  }
  return nilai;
}

function angka(nilai: unknown): number | null {
  return nilai === null || nilai === undefined ? null : Number(nilai);
}

function teks(nilai: unknown): string | null {
  return nilai === null || nilai === undefined ? null : String(nilai);
}

/** Hash transaksi + hash sebelumnya. HMAC bila LEDGER_SECRET diisi, SHA-256 bila tidak. */
export function hashBaris(row: BarisLedger, prev: string | null): string {
  const isi = JSON.stringify([
    teks(row.user_id),
    Number(row.id),
    teks(row.tipe),
    Number(row.nominal),
    Number(row.biaya_admin ?? 0),
    angka(row.sub_post_id),
    angka(row.sub_post_id_tujuan),
    teks(row.wadah_asal),
    teks(row.wadah_tujuan),
    angka(row.account_id),
    angka(row.account_id_tujuan),
    teks(row.tanggal)?.slice(0, 10) ?? null,
    teks(row.label),
    kanonik(row.detail ?? null),
    teks(row.sumber),
    teks(row.status),
    angka(row.pengganti_dari),
    angka(row.induk_id),
    angka(row.plan_version_id),
    teks(row.wa_message_id),
  ]);
  const pesan = `${prev ?? ""}\n${isi}`;
  const kunci = process.env.LEDGER_SECRET?.trim();
  return kunci
    ? createHmac("sha256", kunci).update(pesan).digest("hex")
    : createHash("sha256").update(pesan).digest("hex");
}
