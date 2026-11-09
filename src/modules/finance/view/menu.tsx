import type { ReactElement } from "react";
import {
  IkonAsisten,
  IkonPos,
  IkonProfil,
  IkonPiutang,
  IkonRekap,
  IkonRencana,
  IkonRingkasan,
  IkonTambah,
  IkonTarget,
  IkonTransaksi,
  IkonWawasan,
} from "./ikon";
import type { Tab } from "./tipe";

export const MENU_LAIN: [Tab, string, (p: { aktif: boolean }) => ReactElement][] = [
  ["pos", "Pos pengeluaran", IkonPos],
  ["piutang", "Piutang & utang", IkonPiutang],
  ["target", "Target tabungan", IkonTarget],
  ["asisten", "Asisten keuangan", IkonAsisten],
];

export const MENU_SAMPING: [Tab, string, (p: { aktif: boolean }) => ReactElement][] = [
  ["ringkasan", "Beranda", IkonRingkasan],
  ["riwayat", "Transaksi", IkonTransaksi],
  ["rekap", "Rekap", IkonRekap],
  ["wawasan", "Wawasan", IkonWawasan],
  ["catat", "Catat transaksi", IkonTambah],
  ["rencana", "Rencana bulanan", IkonRencana],
  ...MENU_LAIN,
];

export const MENU_IDENTITAS: [Tab, string, (p: { aktif: boolean }) => ReactElement][] = [
  ["profil", "Profil saya", IkonProfil],
  ["ubah-profil", "Edit profil", IkonProfil],
];

export const MENU_LAINNYA: [Tab, string, (p: { aktif: boolean }) => ReactElement][] = [
  ["rencana", "Rencana bulanan", IkonRencana],
  ...MENU_LAIN,
  ["profil", "Profil saya", IkonProfil],
];

export const TAB_IDENTITAS = new Set<Tab>(["profil", "ubah-profil"]);
export const TAB_UTAMA = new Set<Tab>(["ringkasan", "riwayat", "rekap", "wawasan"]);

export const JUDUL_TAB: Record<Tab, string> = {
  ringkasan: "Beranda",
  rencana: "Rencana bulanan",
  catat: "Transaksi",
  riwayat: "Transaksi",
  rekap: "Rekap",
  wawasan: "Wawasan",
  profil: "Profil saya",
  "ubah-profil": "Edit profil",
  pos: "Pos pengeluaran",
  piutang: "Piutang & utang",
  target: "Target tabungan",
  asisten: "Asisten keuangan",
  lainnya: "Lainnya",
};

export function indukTab(tab: Tab): Tab {
  if (tab === "ubah-profil") return "profil";
  if (TAB_IDENTITAS.has(tab) || tab === "lainnya" || TAB_UTAMA.has(tab)) return "ringkasan";
  return "lainnya";
}
