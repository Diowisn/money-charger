import { createHash, randomInt } from "node:crypto";

const ABJAD = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PANJANG = 10;

export const JUMLAH_KODE_PEMULIHAN = 10;

export function buatKodePemulihan(jumlah = JUMLAH_KODE_PEMULIHAN): string[] {
  const hasil = new Set<string>();
  while (hasil.size < jumlah) {
    let kode = "";
    for (let i = 0; i < PANJANG; i++) kode += ABJAD[randomInt(ABJAD.length)];
    hasil.add(`${kode.slice(0, 5)}-${kode.slice(5)}`);
  }
  return [...hasil];
}

export function normalkanKodePemulihan(kode: string): string {
  return kode.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function hashKodePemulihan(kode: string): string {
  return createHash("sha256").update(normalkanKodePemulihan(kode)).digest("hex");
}
