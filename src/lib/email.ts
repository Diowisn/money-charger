/**
 * Parser ringkas untuk email masuk (mis. notifikasi payroll BSI yang diteruskan via
 * webhook penyedia email). Tidak mengasumsikan format bank tertentu secara ketat;
 * kirim field `nominal` langsung dari penyedia bila memungkinkan supaya lebih akurat.
 */

const KATA_GAJI = /\b(gaji|payroll|salary|upah|thr)\b/i;

/** Mengambil nominal rupiah pertama dari teks notifikasi bank/email. */
export function ekstrakNominalEmail(teks: string): number | null {
  const bersih = teks.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  // Diutamakan angka yang didahului "Rp" (format umum notifikasi bank).
  const dekatRp = /Rp\.?\s?(\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,]\d{2})?/i.exec(bersih);
  const kandidat = dekatRp ?? /(\d{1,3}(?:[.,]\d{3})+)(?:[.,]\d{2})?/.exec(bersih);
  if (!kandidat) return null;
  const angka = Number(kandidat[1].replace(/[.,]/g, ""));
  return Number.isFinite(angka) && angka > 0 ? angka : null;
}

/** Heuristik: email ini kemungkinan notifikasi gaji/payroll, bukan transfer biasa. */
export function kemungkinanGaji(subjek: string, teks: string): boolean {
  return KATA_GAJI.test(subjek) || KATA_GAJI.test(teks);
}
