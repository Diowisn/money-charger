import { timingSafeEqual } from "node:crypto";

export function rahasiaCocok(dikirim: string | null | undefined, diharapkan: string | null | undefined): boolean {
  if (!dikirim || !diharapkan) return false;
  const a = Buffer.from(dikirim, "utf8");
  const b = Buffer.from(diharapkan, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
