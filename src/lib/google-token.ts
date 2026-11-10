import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "g1";

function kunci(nilai: string): Buffer {
  if (!nilai) throw new Error("Kunci enkripsi token Google belum diatur.");
  return createHash("sha256").update("money-charger/google-refresh-token/v1\0").update(nilai).digest();
}

export function enkripsiRefreshTokenGoogle(token: string, nilaiKunci: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", kunci(nilaiKunci), iv);
  const data = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [PREFIX, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function dekripsiRefreshTokenGoogle(paket: string, nilaiKunci: string): string {
  const [prefix, ivBase64, tagBase64, dataBase64] = paket.split(".");
  if (prefix !== PREFIX || !ivBase64 || !tagBase64 || !dataBase64) throw new Error("Token Google tersimpan tidak valid.");
  const decipher = createDecipheriv("aes-256-gcm", kunci(nilaiKunci), Buffer.from(ivBase64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagBase64, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataBase64, "base64url")), decipher.final()]).toString("utf8");
}
