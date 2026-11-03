import type { State } from "./types";

function sel(v: string | number | null): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // cegah injeksi rumus di spreadsheet
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV seluruh transaksi, termasuk yang batal (FR-64). */
export function buatCsv(state: State): string {
  const nama = (id: number | null) => (id ? state.subPosts.find((s) => s.id === id)?.nama ?? String(id) : null);
  const kepala = ["id", "tipe", "nominal", "sub_pos", "sub_pos_tujuan", "wadah_asal", "wadah_tujuan", "tanggal", "label", "sumber", "status", "pengganti_dari", "induk_id"];
  const baris = state.txs.map((t) =>
    [t.id, t.tipe, t.nominal, nama(t.subPostId), nama(t.subPostIdTujuan), t.wadahAsal, t.wadahTujuan, t.tanggal, t.label, t.sumber, t.status, t.penggantiDari, t.indukId]
      .map(sel)
      .join(","),
  );
  return [kepala.join(","), ...baris].join("\n") + "\n";
}
