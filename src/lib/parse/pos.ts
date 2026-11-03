import type { State } from "../types";

export function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export type Kecocokan =
  | { kind: "none" }
  | { kind: "satu"; id: number }
  | { kind: "banyak"; ids: number[] };

function frasaAktif(state: State): { id: number; frasa: string }[] {
  const aktif = new Set(state.subPosts.filter((s) => s.aktif).map((s) => s.id));
  const out: { id: number; frasa: string }[] = [];
  for (const a of state.aliases) if (aktif.has(a.subPostId)) out.push({ id: a.subPostId, frasa: norm(a.alias) });
  for (const s of state.subPosts) if (s.aktif) out.push({ id: s.id, frasa: norm(s.nama) });
  return out.filter((f) => f.frasa);
}

/** Alias atau nama sub-pos yang muncul sebagai kata utuh di teks (FR-10, 6.2). */
export function cariDalamTeks(state: State, teks: string): Kecocokan {
  const padded = ` ${norm(teks)} `;
  const ids = new Set<number>();
  for (const f of frasaAktif(state)) if (padded.includes(` ${f.frasa} `)) ids.add(f.id);
  if (ids.size === 0) return { kind: "none" };
  if (ids.size === 1) return { kind: "satu", id: [...ids][0] };
  return { kind: "banyak", ids: [...ids] };
}

/** Seluruh teks sama persis dengan nama atau alias sebuah sub-pos aktif. */
export function cariPersis(state: State, teks: string): number | null {
  const t = norm(teks);
  if (!t) return null;
  const ids = new Set(frasaAktif(state).filter((f) => f.frasa === t).map((f) => f.id));
  return ids.size === 1 ? [...ids][0] : null;
}

/** Kata pendek untuk daftar pilihan di pertanyaan klarifikasi: alias pertama tiap sub-pos aktif. */
export function daftarPilihan(state: State): string {
  const out: string[] = [];
  for (const s of state.subPosts.filter((x) => x.aktif)) {
    const a = state.aliases.find((x) => x.subPostId === s.id);
    out.push(a ? a.alias : norm(s.nama));
  }
  return out.join(", ");
}
