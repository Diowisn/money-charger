import { authDikonfigurasi, buatToken, cocokkanPassword } from "@/lib/auth";

export function sudahDikonfigurasi(): boolean {
  return authDikonfigurasi();
}

export function masuk(password: string): string | null {
  if (!authDikonfigurasi() || !cocokkanPassword(password)) return null;
  return buatToken();
}
