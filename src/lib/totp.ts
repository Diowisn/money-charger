import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let nilai = 0;
  let hasil = "";
  for (const byte of buf) {
    nilai = (nilai << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      hasil += ALPHABET[(nilai >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) hasil += ALPHABET[(nilai << (5 - bits)) & 31];
  return hasil;
}

export function base32Decode(input: string): Buffer {
  const bersih = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let nilai = 0;
  const out: number[] = [];
  for (const huruf of bersih) {
    const idx = ALPHABET.indexOf(huruf);
    if (idx < 0) continue;
    nilai = (nilai << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((nilai >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function buatSecret(): string {
  return base32Encode(randomBytes(20));
}

export function kodeTotp(secret: string, nowMs = Date.now(), langkahDetik = 30, digit = 6): string {
  const counter = Math.floor(nowMs / 1000 / langkahDetik);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", base32Decode(secret)).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const kode =
    (((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff)) %
    10 ** digit;
  return String(kode).padStart(digit, "0");
}

export function verifikasiTotp(secret: string, token: string, nowMs = Date.now(), jendela = 1): boolean {
  if (!/^\d{6}$/.test(token)) return false;
  const target = Buffer.from(token);
  for (let i = -jendela; i <= jendela; i++) {
    const kandidat = Buffer.from(kodeTotp(secret, nowMs + i * 30_000));
    if (kandidat.length === target.length && timingSafeEqual(kandidat, target)) return true;
  }
  return false;
}

export function otpauthUri(email: string, secret: string, issuer = "Money-Charger"): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(email)}`;
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
