import { catatAudit } from "@/lib/audit";
import { bangunDashboard } from "@/lib/dashboard";
import { wibDate } from "@/lib/parse/date";
import { PgRepo } from "@/lib/pg-repo";
import {
  batalkanDebt,
  batalkanGoal,
  batalkanTransaksi,
  bayarDebt,
  gantiNamaPos,
  nabungGoal,
  nonaktifkanPos,
  simpanRencana,
  simpanSetup,
  tambahAliasPos,
  tambahDebt,
  tambahGoal,
  tambahPos,
  tambahTransaksi,
  type InputDebt,
  type InputGoal,
  type InputTransaksi,
  type ItemRencana,
} from "@/lib/web-actions";
import { AksiError } from "@/lib/web-actions";

export async function muatDashboard() {
  const state = await new PgRepo().load();
  return bangunDashboard(state, wibDate(Date.now()));
}

export async function simpanRencanaFinance(items: ItemRencana[], sekarang: boolean) {
  const hasil = await simpanRencana(new PgRepo(), wibDate(Date.now()), items, sekarang);
  await catatAudit("web", "rencana_diubah", { sekarang });
  return hasil;
}

export async function tambahTransaksiFinance(input: InputTransaksi) {
  const hasil = await tambahTransaksi(new PgRepo(), wibDate(Date.now()), input);
  await catatAudit("web", "transaksi_ditambah", { tipe: input.tipe, id: hasil.id });
  return hasil;
}

export async function batalkanTransaksiFinance(id: number) {
  const hasil = await batalkanTransaksi(new PgRepo(), id);
  await catatAudit("web", "transaksi_dibatalkan", { id });
  return hasil;
}

export async function kelolaPos(body: Record<string, unknown>) {
  const repo = new PgRepo();
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
}) {
  return simpanSetup(new PgRepo(), wibDate(Date.now()), body);
}

export async function tambahDebtFinance(input: InputDebt) {
  return tambahDebt(new PgRepo(), wibDate(Date.now()), input);
}

export async function bayarDebtFinance(id: number, nominal?: number | null) {
  return bayarDebt(new PgRepo(), id, nominal);
}

export async function batalkanDebtFinance(id: number) {
  return batalkanDebt(new PgRepo(), id);
}

export async function tambahGoalFinance(input: InputGoal) {
  return tambahGoal(new PgRepo(), wibDate(Date.now()), input);
}

export async function nabungGoalFinance(id: number, nominal: number) {
  return nabungGoal(new PgRepo(), id, nominal);
}

export async function batalkanGoalFinance(id: number) {
  return batalkanGoal(new PgRepo(), id);
}
