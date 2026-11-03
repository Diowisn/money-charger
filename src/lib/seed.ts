/** Data bawaan: Draft 1 (SRS 3.1) dan alias bawaan (SRS 6.2). Satu-satunya sumber seed. */

export interface SeedSubPos {
  nama: string;
  grup: string;
  jatah: number;
  alias: string[];
}

export const SEED_GRUP = ["Operasional Harian", "Keluarga & Gaya Hidup"] as const;

export const SEED_SUBPOS: SeedSubPos[] = [
  { nama: "Bensin & Parkir", grup: "Operasional Harian", jatah: 150_000, alias: ["bensin", "bbm", "pertamax", "pertalite", "parkir"] },
  { nama: "Bahan Bekal & Makan", grup: "Operasional Harian", jatah: 350_000, alias: ["makan", "bekal", "nasi", "lauk", "sayur", "warung"] },
  { nama: "Pulsa & Paket Data", grup: "Operasional Harian", jatah: 100_000, alias: ["pulsa", "paket", "data", "kuota"] },
  { nama: "Kebutuhan Mandi & Kebersihan", grup: "Operasional Harian", jatah: 100_000, alias: ["sabun", "sampo", "mandi", "odol", "kebersihan", "detergen"] },
  { nama: "Uang Orang Tua", grup: "Keluarga & Gaya Hidup", jatah: 350_000, alias: ["ortu", "orang tua", "bapak", "ibu", "kirim ortu"] },
  { nama: "Jajan / Kopi / Self-Reward", grup: "Keluarga & Gaya Hidup", jatah: 150_000, alias: ["jajan", "kopi", "snack", "es", "minum", "reward"] },
];

export const SEED_DD = 100_000;
export const SEED_TABUNGAN = 400_000;
export const SEED_INVESTASI = 100_000;
export const SEED_NAMA_JAJAN = "Jajan / Kopi / Self-Reward";

export const SEED_CONFIG_DEFAULT: Record<string, string> = {
  saldo_awal: "0",
  tabungan_awal: "0",
  investasi_awal: "0",
  ambang_gaji_ganda: "20",
  persen_jajan: "50",
  gaji_pokok: "1800000",
};
