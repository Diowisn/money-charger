import { catatAudit } from "@/lib/audit";
import { bangunDashboard } from "@/lib/dashboard";
import { wibDate } from "@/lib/parse/date";
import { PgRepo } from "@/lib/pg-repo";
import type { JadwalLaporan } from "@/lib/types";
import { daftarAturan } from "@/modules/recurring/model";
import { ambilProfil } from "@/modules/profile/model";
import { statusEmail } from "@/modules/email/model";
import { pastikanAkunDefault } from "@/modules/accounts/model";
import {
  batalkanDebt,
  batalkanGoal,
  batalkanTransaksi,
  bayarDebt,
  gantiNamaPos,
  nabungGoal,
  nonaktifkanPos,
  simpanGajiPokok,
  simpanRencana,
  simpanSetup,
  tambahAliasPos,
  tambahDebt,
  tambahGoal,
  tambahPos,
  tambahTransaksi,
  ubahTransaksi,
  type InputDebt,
  type InputGoal,
  type InputTransaksi,
  type InputUbahTransaksi,
  type ItemRencana,
} from "@/lib/web-actions";
import { AksiError } from "@/lib/web-actions";

export async function muatDashboard(userId: string) {
  const hariIni = wibDate(Date.now());
  await pastikanAkunDefault(userId);
  const repo = new PgRepo(undefined, undefined, userId);
  await repo.ensureLedger();
  const [state, ledger, profil, otomatis, email] = await Promise.all([
    repo.load(),
    repo.verifyLedger(),
    ambilProfil(userId),
    daftarAturan(userId, hariIni),
    statusEmail(userId),
  ]);
  return { ...bangunDashboard(state, hariIni), ledger, email, profil: profil ?? undefined, otomatis };
}

export async function simpanRencanaFinance(items: ItemRencana[], sekarang: boolean, userId: string) {
  const hasil = await simpanRencana(new PgRepo(undefined, undefined, userId), wibDate(Date.now()), items, sekarang);
  await catatAudit("web", "rencana_diubah", { sekarang });
  return hasil;
}

export async function tambahTransaksiFinance(input: InputTransaksi, userId: string) {
  const hasil = await tambahTransaksi(new PgRepo(undefined, undefined, userId), wibDate(Date.now()), input);
  await catatAudit("web", "transaksi_ditambah", { tipe: input.tipe, id: hasil.id });
  return hasil;
}

export async function ubahTransaksiFinance(input: InputUbahTransaksi, userId: string) {
  const hasil = await ubahTransaksi(new PgRepo(undefined, undefined, userId), wibDate(Date.now()), input);
  await catatAudit("web", "transaksi_diubah", {
    id: hasil.id,
    nominal: input.nominal,
    tanggal: input.tanggal,
  });
  return hasil;
}

export async function batalkanTransaksiFinance(id: number, userId: string) {
  const hasil = await batalkanTransaksi(new PgRepo(undefined, undefined, userId), id);
  await catatAudit("web", "transaksi_dibatalkan", { id });
  return hasil;
}

export async function kelolaPos(body: Record<string, unknown>, userId: string) {
  const repo = new PgRepo(undefined, undefined, userId);
  const id = Number(body.id);

  switch (String(body.aksi ?? "")) {
    case "tambah":
      return tambahPos(repo, {
        groupId: Number(body.groupId),
        nama: String(body.nama ?? ""),
        jatah: Number(body.jatah ?? 0),
      });
    case "ganti_nama":
      await gantiNamaPos(repo, id, String(body.nama ?? ""));
      return undefined;
    case "alias":
      await tambahAliasPos(repo, id, String(body.alias ?? ""));
      return undefined;
    case "nonaktif":
      await nonaktifkanPos(repo, id);
      return undefined;
    default:
      throw new AksiError("Aksi pos tidak dikenal.");
  }
}

export async function simpanSetupFinance(body: {
  tanggalMulai: string;
  saldoAwal: number;
  tabunganAwal: number;
  investasiAwal: number;
}, userId: string) {
  return simpanSetup(new PgRepo(undefined, undefined, userId), wibDate(Date.now()), body);
}

export async function simpanGajiPokokFinance(nominal: number, userId: string) {
  await simpanGajiPokok(new PgRepo(undefined, undefined, userId), nominal);
  await catatAudit("web", "gaji_pokok_diubah", { nominal });
}

export async function simpanDigestFinance(aktif: boolean, userId: string) {
  await new PgRepo(undefined, undefined, userId).transaction(async (tx) => {
    await tx.setConfig("digest_aktif", aktif ? "1" : "0");
  });
  await catatAudit("web", "digest_diubah", { aktif });
}

export async function simpanAiReviewFinance(aktif: boolean, userId: string) {
  await new PgRepo(undefined, undefined, userId).transaction(async (tx) => {
    await tx.setConfig("ai_review_aktif", aktif ? "1" : "0");
  });
  await catatAudit("web", "ai_review_diubah", { aktif });
}

export async function simpanLaporanFinance(input: { aktif?: boolean; jadwal?: JadwalLaporan }, userId: string) {
  await new PgRepo(undefined, undefined, userId).transaction(async (tx) => {
    const state = await tx.load();
    const aktif = input.aktif ?? state.config.laporanAktif;
    const jadwal = input.jadwal ?? state.config.laporanJadwal;
    await tx.setConfig("laporan_aktif", aktif ? "1" : "0");
    await tx.setConfig("laporan_jadwal", jadwal);
  });
  await catatAudit("web", "laporan_diubah", input);
}

export async function tambahDebtFinance(input: InputDebt, userId: string) {
  return tambahDebt(new PgRepo(undefined, undefined, userId), wibDate(Date.now()), input);
}

export async function bayarDebtFinance(id: number, nominal: number | null | undefined, userId: string) {
  return bayarDebt(new PgRepo(undefined, undefined, userId), id, nominal);
}

export async function batalkanDebtFinance(id: number, userId: string) {
  return batalkanDebt(new PgRepo(undefined, undefined, userId), id);
}

export async function tambahGoalFinance(input: InputGoal, userId: string) {
  return tambahGoal(new PgRepo(undefined, undefined, userId), wibDate(Date.now()), input);
}

export async function nabungGoalFinance(id: number, nominal: number, userId: string) {
  return nabungGoal(new PgRepo(undefined, undefined, userId), id, nominal);
}

export async function batalkanGoalFinance(id: number, userId: string) {
  return batalkanGoal(new PgRepo(undefined, undefined, userId), id);
}
