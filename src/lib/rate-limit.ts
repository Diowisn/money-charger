/**
 * Pembatas laju sederhana per proses (best-effort).
 *
 * Serverless bisa menjalankan beberapa instance, jadi batas ini tidak menggantikan
 * proteksi di platform. Untuk aplikasi pribadi ini cukup mencegah brute-force dan
 * penyalahgunaan endpoint AI dari satu instance.
 */
interface Bucket {
  jumlah: number;
  resetPada: number;
}

const globalRate = globalThis as unknown as { __mcRateLimit?: Map<string, Bucket> };

function peta(): Map<string, Bucket> {
  if (!globalRate.__mcRateLimit) globalRate.__mcRateLimit = new Map();
  return globalRate.__mcRateLimit;
}

export interface HasilBatas {
  boleh: boolean;
  sisa: number;
  detikTunggu: number;
}

export function batasi(kunci: string, batas: number, jendelaMs: number, sekarang = Date.now()): HasilBatas {
  const m = peta();
  const b = m.get(kunci);
  if (!b || b.resetPada <= sekarang) {
    m.set(kunci, { jumlah: 1, resetPada: sekarang + jendelaMs });
    return { boleh: true, sisa: batas - 1, detikTunggu: 0 };
  }
  if (b.jumlah >= batas) {
    return { boleh: false, sisa: 0, detikTunggu: Math.max(1, Math.ceil((b.resetPada - sekarang) / 1000)) };
  }
  b.jumlah += 1;
  return { boleh: true, sisa: batas - b.jumlah, detikTunggu: 0 };
}

export function ipDariRequest(_req: Request): string {
  return "lokal";
}

export function resetBatasUntukUji(): void {
  peta().clear();
}
