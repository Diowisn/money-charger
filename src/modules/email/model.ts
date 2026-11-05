import { catatAudit } from "@/lib/audit";
import { arahEmail, ekstrakNominalEmail, ekstrakTanggalEmail, labelEmail } from "@/lib/email";
import { rahasiaCocok as cocokRahasia } from "@/lib/secret";
import { wibDate } from "@/lib/parse/date";
import { PgRepo } from "@/lib/pg-repo";
import { AksiError, tambahTransaksi } from "@/lib/web-actions";

export class EmailAksiError extends Error {}

export interface EmailMasuk {
  id: string;
  dari?: string;
  subjek?: string;
  teks?: string;
  /** Nominal rupiah bila penyedia email sudah mengekstraknya; lebih akurat dari parser teks. */
  nominal?: number;
  /** Tanggal transaksi 'YYYY-MM-DD' bila penyedia mengirimkannya (mis. tanggal email). */
  tanggal?: string;
}

export interface HasilEmail {
  dicatat: boolean;
  pesan: string;
}

function rahasiaCocok(nilai: string | null): boolean {
  return cocokRahasia(nilai, process.env.EMAIL_INBOUND_SECRET?.trim());
}

export function emailDikonfigurasi(): boolean {
  return Boolean(process.env.EMAIL_INBOUND_SECRET?.trim());
}

export function verifikasiRahasiaEmail(nilai: string | null): boolean {
  return rahasiaCocok(nilai);
}

function tanggalIsoSah(nilai: unknown, hariIni: string): string | null {
  if (typeof nilai !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(nilai)) return null;
  const [y, m, d] = nilai.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return nilai <= hariIni ? nilai : null;
}

function pengirimDiizinkan(dari: string | undefined): boolean {
  const daftar = process.env.EMAIL_ALLOWED_SENDERS?.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!daftar?.length) return true;
  const alamat = (dari ?? "").toLowerCase();
  return Boolean(alamat) && daftar.some((pola) => alamat.includes(pola));
}

/**
 * Mencatat email masuk sebagai gaji, pemasukan, atau pengeluaran sesuai arah
 * transaksi di email. Idempoten per `id` (dipakai ulang bila penyedia mengirim retry).
 */
export async function prosesEmailMasuk(input: EmailMasuk): Promise<HasilEmail> {
  if (!input.id) throw new EmailAksiError("id email wajib diisi untuk mencegah duplikat.");
  if (!pengirimDiizinkan(input.dari)) {
    return { dicatat: false, pesan: "Pengirim email tidak ada di EMAIL_ALLOWED_SENDERS; dilewati." };
  }

  const repo = new PgRepo();
  const hariIni = wibDate(Date.now());
  const teksGabung = `${input.subjek ?? ""}\n${input.teks ?? ""}`;
  const arah = arahEmail(input.subjek ?? "", input.teks ?? "");
  const tanggal = tanggalIsoSah(input.tanggal, hariIni) ?? ekstrakTanggalEmail(teksGabung, hariIni) ?? hariIni;

  const hasil = await repo.transaction(async (tx) => {
    const idInbound = `email:${input.id}`;
    if (!(await tx.tryRecordInbound(idInbound))) {
      return { dicatat: false, pesan: "Email ini sudah pernah diproses (ID sama), dilewati." };
    }

    if (!arah) {
      await tx.setInboundResult(idInbound, "arah_tidak_dikenal");
      return { dicatat: false, pesan: "Arah transaksi tidak dikenali (masuk/keluar); tidak ada yang dicatat." };
    }

    const nominal = input.nominal && input.nominal > 0 ? Math.round(input.nominal) : ekstrakNominalEmail(teksGabung);
    if (!nominal) {
      await tx.setInboundResult(idInbound, "nominal_tidak_ditemukan");
      return { dicatat: false, pesan: "Nominal tidak ditemukan di email; tidak ada yang dicatat." };
    }

    const label = labelEmail(input.subjek ?? "", input.teks ?? "", arah) ?? (input.subjek ?? "Email masuk").slice(0, 120);

    try {
      if (arah === "keluar") {
        const hasil = await tambahTransaksi(tx, hariIni, {
          tipe: "out",
          nominal,
          tanggal,
          label,
        });
        await tx.setInboundResult(idInbound, `out:${hasil.id}`);
        return { dicatat: true, pesan: `Pengeluaran Rp${nominal.toLocaleString("id-ID")} dicatat otomatis dari email "${label}".` };
      }

      if (arah === "gaji") {
        const hasil = await tambahTransaksi(tx, hariIni, {
          tipe: "gaji",
          nominal,
          tanggal,
          label,
          paksa: true,
        });
        await tx.setInboundResult(idInbound, `gaji:${hasil.id}`);
        return { dicatat: true, pesan: `Gaji Rp${nominal.toLocaleString("id-ID")} dicatat otomatis dari email "${label}".` };
      }

      const hasil = await tambahTransaksi(tx, hariIni, {
        tipe: "in",
        nominal,
        tanggal,
        label,
        wadah: "saldo",
      });
      await tx.setInboundResult(idInbound, `in:${hasil.id}`);
      return { dicatat: true, pesan: `Pemasukan Rp${nominal.toLocaleString("id-ID")} dicatat otomatis dari email "${label}".` };
    } catch (e) {
      if (e instanceof AksiError) {
        await tx.setInboundResult(idInbound, `error:${e.message}`.slice(0, 120));
        return { dicatat: false, pesan: e.message };
      }
      throw e;
    }
  });
  await catatAudit("email", "email_diproses", { dicatat: hasil.dicatat });
  return hasil;
}
