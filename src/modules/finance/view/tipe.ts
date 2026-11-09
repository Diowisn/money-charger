export type Pesan = { jenis: "ok" | "error"; teks: string };

export type Konfirmasi = { teks: string; judul: string; selesai: (nilai: boolean) => void };

export type HasilScan = {
  nominal: number;
  subPos: string | null;
  tanggal: string | null;
  label: string | null;
  toko: string | null;
  alamat: string | null;
  kontak: string | null;
  konsumen: string | null;
  kasir: string | null;
  kategori: string | null;
  pajak: number | null;
  dibayar: number | null;
  kembalian: number | null;
};

export type Tab =
  | "ringkasan"
  | "rencana"
  | "catat"
  | "riwayat"
  | "rekap"
  | "wawasan"
  | "profil"
  | "ubah-profil"
  | "pos"
  | "piutang"
  | "target"
  | "asisten"
  | "lainnya";

export type StatusLive = "hidup" | "terputus";
export type Tema = "terang" | "gelap";
export type ChatPesan = { peran: "user" | "ai"; teks: string };

export type Kirim = (url: string, method: string, body?: unknown) => Promise<boolean>;
export type MintaKonfirmasi = (judul: string, teks: string) => Promise<boolean>;
