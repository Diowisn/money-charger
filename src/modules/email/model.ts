import { catatAudit } from "@/lib/audit";
import { ekstrakNominalEmail, kemungkinanGaji } from "@/lib/email";
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

/**
 * Mencatat email masuk sebagai gaji (bila subjek/isi menyebut gaji/payroll) atau
 * pemasukan biasa. Idempoten per `id` (dipakai ulang bila penyedia mengirim retry).
 */
export async function prosesEmailMasuk(input: EmailMasuk): Promise<HasilEmail> {
  if (!input.id) throw new EmailAksiError("id email wajib diisi untuk mencegah duplikat.");
  const repo = new PgRepo();
  const hariIni = wibDate(Date.now());
  const teksGabung = `${input.subjek ?? ""}\n${input.teks ?? ""}`;

  const hasil = await repo.transaction(async (tx) => {
    const idInbound = `email:${input.id}`;
    if (!(await tx.tryRecordInbound(idInbound))) {
      return { dicatat: false, pesan: "Email ini sudah pernah diproses (ID sama), dilewati." };
    }

    const nominal = input.nominal && input.nominal > 0 ? Math.round(input.nominal) : ekstrakNominalEmail(teksGabung);
    if (!nominal) {
      await tx.setInboundResult(idInbound, "nominal_tidak_ditemukan");
      return { dicatat: false, pesan: "Nominal tidak ditemukan di email; tidak ada yang dicatat." };
    }

    const label = (input.subjek ?? "Email masuk").slice(0, 120);
    const gaji = kemungkinanGaji(input.subjek ?? "", teksGabung);

    try {
      if (gaji) {
        const hasil = await tambahTransaksi(tx, hariIni, {
          tipe: "gaji",
          nominal,
          tanggal: hariIni,
          label,
          paksa: true,
        });
        await tx.setInboundResult(idInbound, `gaji:${hasil.id}`);
        return { dicatat: true, pesan: `Gaji Rp${nominal.toLocaleString("id-ID")} dicatat otomatis dari email "${label}".` };
      }
      const hasil = await tambahTransaksi(tx, hariIni, {
        tipe: "in",
        nominal,
        tanggal: hariIni,
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
