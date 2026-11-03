export const WADAH = ["saldo", "tabungan", "investasi"] as const;
export type Wadah = (typeof WADAH)[number];

export type TxTipe =
  | "out"
  | "in"
  | "gaji"
  | "bonus"
  | "tarik"
  | "pindah"
  | "alokasi_gaji"
  | "selisih_gaji"
  | "tambahan_jatah"
  | "geser";

/** Transaksi turunan: dibatalkan bersama induknya dan tidak pernah jadi "catatan terakhir". */
export const TURUNAN: ReadonlySet<TxTipe> = new Set<TxTipe>([
  "alokasi_gaji",
  "selisih_gaji",
  "tambahan_jatah",
]);

export interface Tx {
  id: number;
  tipe: TxTipe;
  nominal: number;
  subPostId: number | null;
  subPostIdTujuan: number | null;
  wadahAsal: Wadah | null;
  wadahTujuan: Wadah | null;
  tanggal: string; // YYYY-MM-DD (WIB)
  label: string | null;
  sumber: "kaku" | "ai";
  status: "berlaku" | "batal";
  penggantiDari: number | null;
  indukId: number | null;
  planVersionId: number | null;
  waMessageId: string | null;
}

export type NewTx = Omit<Tx, "id" | "status"> & { status?: Tx["status"] };

export function buatTx(
  p: Partial<NewTx> & Pick<NewTx, "tipe" | "nominal" | "tanggal">,
): NewTx {
  return {
    subPostId: null,
    subPostIdTujuan: null,
    wadahAsal: null,
    wadahTujuan: null,
    label: null,
    sumber: "kaku",
    penggantiDari: null,
    indukId: null,
    planVersionId: null,
    waMessageId: null,
    ...p,
  };
}

export interface Group {
  id: number;
  nama: string;
  urutan: number;
}

export interface SubPost {
  id: number;
  groupId: number;
  nama: string;
  kategori: string | null;
  aktif: boolean;
  urutan: number;
}

export interface AliasRow {
  alias: string;
  subPostId: number;
}

export interface PlanItem {
  tipe: "sub_pos" | "dd" | "tabungan" | "investasi";
  subPostId: number | null;
  nominal: number;
}

export interface PlanVersion {
  id: number;
  nama: string;
  status: "aktif" | "usulan" | "arsip";
  items: PlanItem[];
}

export interface Config {
  tanggalMulai: string | null;
  saldoAwal: number;
  tabunganAwal: number;
  investasiAwal: number;
  ambangGajiGanda: number;
  persenJajan: number;
  gajiPokok: number;
  bonusSubPostId: number | null;
}

export interface State {
  config: Config;
  groups: Group[];
  subPosts: SubPost[];
  aliases: AliasRow[];
  plans: PlanVersion[];
  txs: Tx[];
}

export interface Pending {
  id: number;
  jenis: string;
  payload: Record<string, unknown>;
  kedaluwarsaPada: number; // epoch ms
}
