import { bangunDashboard } from "@/lib/dashboard";
import { wibDate } from "@/lib/parse/date";
import { PgRepo } from "@/lib/pg-repo";
import {
  batalkanTransaksi,
  gantiNamaPos,
  nonaktifkanPos,
  simpanRencana,
  simpanSetup,
  tambahAliasPos,
  tambahPos,
  tambahTransaksi,
  type InputTransaksi,
  type ItemRencana,
} from "@/lib/web-actions";
import { AksiError } from "@/lib/web-actions";

export async function muatDashboard() {
  const state = await new PgRepo().load();
  return bangunDashboard(state, wibDate(Date.now()));
}

export async function simpanRencanaFinance(items: ItemRencana[], sekarang: boolean) {
  return simpanRencana(new PgRepo(), wibDate(Date.now()), items, sekarang);
}

export async function tambahTransaksiFinance(input: InputTransaksi) {
  return tambahTransaksi(new PgRepo(), wibDate(Date.now()), input);
}

export async function batalkanTransaksiFinance(id: number) {
  return batalkanTransaksi(new PgRepo(), id);
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
