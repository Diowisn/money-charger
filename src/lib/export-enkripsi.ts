import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const MAGIC = Buffer.from("MCENC1");
const SALT = 16;
const IV = 12;
const TAG = 16;

function kunci(password: string, salt: Buffer): Buffer {
  if (password.length < 8) throw new Error("Password ekspor minimal 8 karakter.");
  return scryptSync(password, salt, 32);
}

export function enkripsiEkspor(teks: string, password: string): Buffer {
  const salt = randomBytes(SALT);
  const iv = randomBytes(IV);
  const cipher = createCipheriv("aes-256-gcm", kunci(password, salt), iv);
  const data = Buffer.concat([cipher.update(teks, "utf8"), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), data]);
}

export function dekripsiEkspor(paket: Buffer, password: string): string {
  if (!paket.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("Berkas ekspor tidak dikenal.");
  let offset = MAGIC.length;
  const salt = paket.subarray(offset, offset + SALT);
  offset += SALT;
  const iv = paket.subarray(offset, offset + IV);
  offset += IV;
  const tag = paket.subarray(offset, offset + TAG);
  offset += TAG;
  const data = paket.subarray(offset);
  const decipher = createDecipheriv("aes-256-gcm", kunci(password, salt), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
