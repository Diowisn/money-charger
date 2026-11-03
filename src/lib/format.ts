/** Format rupiah manual (tanpa Intl) supaya hasilnya sama di semua lingkungan. */
export function rp(n: number): string {
  const neg = n < 0;
  const s = String(Math.abs(Math.trunc(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${neg ? "-" : ""}Rp${s}`;
}

/** '2026-10-17' -> '17/10' */
export function tglPendek(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

/** Pecah teks panjang menjadi beberapa pesan <= batas, memotong di batas baris (SRS 8). */
export function splitPesan(text: string, batas = 4096): string[] {
  if (text.length <= batas) return [text];
  const out: string[] = [];
  let cur = "";
  for (const line of text.split("\n")) {
    const kandidat = cur ? `${cur}\n${line}` : line;
    if (kandidat.length > batas) {
      if (cur) out.push(cur);
      cur = line.length > batas ? line.slice(0, batas) : line;
    } else {
      cur = kandidat;
    }
  }
  if (cur) out.push(cur);
  return out;
}
