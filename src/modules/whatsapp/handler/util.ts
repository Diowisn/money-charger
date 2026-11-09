import { createHash } from "node:crypto";
import { TURUNAN, type State, type Tx } from "@/lib/types";

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export const judul = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

/** Catatan terakhir yang bisa dikoreksi/dihapus: bukan turunan, bukan anak dari catatan lain. */
export function catatanTerakhir(state: State): Tx | null {
  const k = state.txs.filter((t) => t.status === "berlaku" && t.indukId === null && !TURUNAN.has(t.tipe));
  return k.length ? k.reduce((a, b) => (b.id > a.id ? b : a)) : null;
}
