import { catatAudit } from "@/lib/audit";
import {
  arahEmail,
  deteksiPenyediaEmail,
  ekstrakDetailEmail,
  ekstrakNominalEmail,
  ekstrakTanggalEmail,
  labelEmail,
  type DetailEmail,
} from "@/lib/email";
import { rahasiaCocok as cocokRahasia } from "@/lib/secret";
import { wibDate } from "@/lib/parse/date";
import { cocokAkun } from "@/lib/parse/dompet";
import { cariDalamTeks, cariPersis } from "@/lib/parse/pos";
import { getPool, PgRepo } from "@/lib/pg-repo";
import type { State } from "@/lib/types";
import { AksiError, tambahTransaksi } from "@/lib/web-actions";

export class EmailAksiError extends Error {}

export interface EmailMasuk {
  id: string;
  dari?: string;
  subjek?: string;
  teks?: string;
  /** Email kotak masuk penerima; dipakai mencocokkan transaksi ke akun yang login/terdaftar. */
  akun?: string;
  /** Nominal rupiah bila penyedia email sudah mengekstraknya; lebih akurat dari parser teks. */
  nominal?: number;
  /** Tanggal transaksi 'YYYY-MM-DD' bila penyedia mengirimkannya (mis. tanggal email). */
  tanggal?: string;
  /** Nama bank/e-wallet atau dompet sumber bila penyedia mengirimkannya. */
  dompet?: string;
  /** Nama bank/e-wallet pengirim bila penyedia mengirimkannya. */
  penyedia?: string;
}

function pilihPos(state: State, detail: DetailEmail, label: string | null): number | null {
  for (const teks of [detail.jenisTransaksi, detail.merchant, label]) {
    if (!teks) continue;
    const persis = cariPersis(state, teks);
    if (persis !== null) return persis;
    const cocok = cariDalamTeks(state, teks);
    if (cocok.kind === "satu") return cocok.id;
  }
  return null;
}

export interface HasilEmail {
  dicatat: boolean;
  pesan: string;
}

export interface StatusEmail {
  email: string | null;
  terdaftar: boolean;
  terhubung: boolean;
  linkedAt: string | null;
  lastEmailAt: string | null;
}

function iso(nilai: unknown): string | null {
  if (!nilai) return null;
  const ms = nilai instanceof Date ? nilai.getTime() : Date.parse(String(nilai));
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** Status tautan Gmail/Apps Script untuk satu akun. */
export async function statusEmail(userId: string): Promise<StatusEmail> {
  try {
    const hasil = await getPool().query<{ email: string; terdaftar: boolean; linked_at: unknown; last_email_at: unknown }>(
      `SELECT u.email, (l.user_id IS NOT NULL) AS terdaftar, l.linked_at, l.last_email_at
       FROM auth_users u LEFT JOIN email_links l ON l.user_id = u.id
       WHERE u.id = $1`,
      [userId],
    );
    const row = hasil.rows[0];
    return {
      email: row?.email ?? null,
      terdaftar: Boolean(row?.terdaftar),
      terhubung: Boolean(row?.linked_at || row?.last_email_at),
      linkedAt: iso(row?.linked_at),
      lastEmailAt: iso(row?.last_email_at),
    };
  } catch (error) {
    if ((error as { code?: string }).code === "42P01") {
      return { email: null, terdaftar: false, terhubung: false, linkedAt: null, lastEmailAt: null };
    }
    throw error;
  }
}

/** Dipanggil Apps Script setelah trigger Gmail dipasang. Email harus cocok dengan akun terdaftar. */
export async function tautkanEmailAkun(akun: unknown): Promise<{ email: string } | null> {
  const alamat = typeof akun === "string" ? akun.trim().toLowerCase() : "";
  if (!alamat) throw new EmailAksiError("Alamat Gmail wajib diisi.");
  const hasil = await getPool().query<{ id: string; email: string }>(
    "SELECT id, email FROM auth_users WHERE lower(email) = $1 LIMIT 1",
    [alamat],
  );
  const user = hasil.rows[0];
  if (!user) return null;
  await getPool().query(
    `INSERT INTO email_links (user_id, email, linked_at)
     VALUES ($1, $2, now())
     ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email, linked_at = now()`,
    [user.id, user.email],
  );
  return { email: user.email };
}

async function catatEmailMasuk(userId: string, akun: string) {
  try {
    await getPool().query(
      `INSERT INTO email_links (user_id, email, linked_at, last_email_at)
       VALUES ($1, $2, now(), now())
       ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email, last_email_at = now()`,
      [userId, akun],
    );
  } catch (error) {
    if ((error as { code?: string }).code !== "42P01") throw error;
  }
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

  const pemilik = new PgRepo();
  const userId = await pemilik.userIdByEmailOrSoleUser(input.akun);
  if (!userId) {
    return {
      dicatat: false,
      pesan: input.akun
        ? `Email untuk "${input.akun}" tidak cocok dengan akun terdaftar; dilewati agar tidak masuk ke akun lain.`
        : "Email tidak menyertakan alamat penerima; dilewati karena ada lebih dari satu akun.",
    };
  }
  if (input.akun) await catatEmailMasuk(userId, input.akun);
  const repo = new PgRepo(undefined, undefined, userId);
  const hariIni = wibDate(Date.now());
  const teksGabung = `${input.subjek ?? ""}\n${input.teks ?? ""}`;
  const arah = arahEmail(input.subjek ?? "", input.teks ?? "");
  const tanggal = tanggalIsoSah(input.tanggal, hariIni) ?? ekstrakTanggalEmail(teksGabung, hariIni) ?? hariIni;
  const detail = ekstrakDetailEmail(teksGabung);
  const penyedia = input.penyedia ?? deteksiPenyediaEmail(input.dari, input.subjek, input.teks);

  const hasil = await repo.transaction(async (tx) => {
    const idInbound = `email:${input.id}`;
    if (!(await tx.tryRecordInbound(idInbound))) {
      return { dicatat: false, pesan: "Email ini sudah pernah diproses (ID sama), dilewati." };
    }

    if (!arah) {
      await tx.setInboundResult(idInbound, "arah_tidak_dikenal");
      return { dicatat: false, pesan: "Arah transaksi tidak dikenali (masuk/keluar); tidak ada yang dicatat." };
    }

    const nominal =
      detail.total ??
      (input.nominal && input.nominal > 0 ? Math.round(input.nominal) : ekstrakNominalEmail(teksGabung));
    if (!nominal) {
      await tx.setInboundResult(idInbound, "nominal_tidak_ditemukan");
      return { dicatat: false, pesan: "Nominal tidak ditemukan di email; tidak ada yang dicatat." };
    }

    const label = detail.merchant ?? labelEmail(input.subjek ?? "", input.teks ?? "", arah) ?? (input.subjek ?? "Email masuk").slice(0, 120);
    const state = await tx.load();
    const dompet = input.dompet ?? detail.dompet ?? penyedia;
    const accountId = cocokAkun(state.accounts, [dompet, penyedia, detail.dompet]) ?? undefined;
    const subPostId = arah === "keluar" ? pilihPos(state, detail, label) : null;
    const detailFinal = { ...detail, dompet: input.dompet ?? detail.dompet, penyedia, sumber: "email" };

    try {
      if (arah === "keluar") {
        const hasil = await tambahTransaksi(tx, hariIni, {
          tipe: "out",
          nominal,
          tanggal,
          label,
          subPostId,
          accountId,
          detail: detailFinal,
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
          accountId,
          detail: detailFinal,
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
        accountId,
        detail: detailFinal,
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
