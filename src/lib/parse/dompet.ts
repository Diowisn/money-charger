import type { Akun } from "../types";
import { norm } from "./pos";

const pad = (nilai: string) => ` ${norm(nilai)} `;

/**
 * Mencocokkan petunjuk dompet dari email (nama bank/e-wallet, nomor masker,
 * atau field dompet dari penyedia) ke dompet aktif milik pengguna.
 * Hanya mengembalikan id bila cocoknya tunggal; jika ambigu, biarkan dompet bawaan.
 */
export function cocokAkun(accounts: Akun[], hints: (string | null | undefined)[]): number | null {
  const aktif = accounts.filter((a) => a.aktif);
  if (!aktif.length) return null;

  for (const hint of hints) {
    const teks = norm(hint ?? "");
    if (!teks) continue;

    const persis = aktif.filter((a) => norm(a.nama) === teks || norm(a.tipe) === teks);
    if (persis.length === 1) return persis[0].id;

    const dalam = aktif.filter((a) => {
      const nama = norm(a.nama);
      return Boolean(nama) && (pad(teks).includes(pad(nama)) || pad(nama).includes(pad(teks)));
    });
    if (dalam.length === 1) return dalam[0].id;
  }

  return null;
}
