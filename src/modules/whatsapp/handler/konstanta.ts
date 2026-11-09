export const TEKS_NON_TEKS =
  'Maaf, saya hanya bisa membaca pesan teks dan foto struk/transaksi, bukan suara atau stiker. Contoh: "out 25rb kopi", "gaji masuk 1.8 juta", "saldo". Ketik "bantuan" untuk daftar lengkap.';

export const TEKS_FOTO_GAGAL =
  'Foto belum bisa dibaca otomatis. Pastikan nominal total terlihat jelas, atau catat manual: "out 25rb kopi". Ketik "bantuan" untuk daftar perintah.';

export const TEKS_FOTO_TIDAK_JELAS =
  'Foto ini sepertinya bukan struk/transaksi, atau nominalnya tidak terlihat jelas. Coba foto ulang dengan nominal total terlihat, atau catat manual: "out 25rb kopi".';

export const TEKS_TIDAK_DIKENAL =
  'Perintah tidak dikenali. Ketik "bantuan" untuk daftar perintah.';

export const TEKS_FALLBACK_KAKU =
  'Pesan itu belum bisa dibaca otomatis. Pakai format: "out 25rb kopi" atau "in 150rb freelance". Ketik "bantuan" untuk daftar perintah.';

const MENIT = 60_000;

export const KONFIRMASI_MS = 10 * MENIT; // FR-82
export const PETAKAN_MS = 24 * 60 * MENIT;
export const EKSPOR_MS = 15 * MENIT; // NFR-10
