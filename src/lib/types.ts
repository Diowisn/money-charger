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
  biayaAdmin: number;
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
    biayaAdmin: 0,
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
  /** Izin mengirim isi pesan ke provider AI (bisa dicabut dengan "ai off"). */
  aiAktif: boolean;
  /** Tampilkan pratinjau dan minta "ya" sebelum transaksi hasil AI dicatat. */
  aiKonfirmasi: boolean;
}

export type DebtJenis = "piutang" | "utang";
export type DebtStatus = "aktif" | "lunas" | "batal";

export interface Debt {
  id: number;
  jenis: DebtJenis;
  nama: string;
  nominal: number;
  dibayar: number;
  tanggal: string;
  jatuhTempo: string | null;
  catatan: string | null;
  status: DebtStatus;
}

export type NewDebt = Omit<Debt, "id" | "status"> & { status?: DebtStatus };

export type GoalStatus = "aktif" | "selesai" | "batal";

export interface SavingGoal {
  id: number;
  nama: string;
  targetNominal: number;
  terkumpul: number;
  tanggal: string;
  targetTanggal: string | null;
  catatan: string | null;
  status: GoalStatus;
}

export type NewSavingGoal = Omit<SavingGoal, "id" | "status" | "terkumpul"> & {
  terkumpul?: number;
  status?: GoalStatus;
};

export interface State {
  config: Config;
  groups: Group[];
  subPosts: SubPost[];
  aliases: AliasRow[];
  plans: PlanVersion[];
  txs: Tx[];
  debts: Debt[];
  goals: SavingGoal[];
}

export interface ProfilAkun {
  nama: string | null;
  email: string;
  avatar: string | null;
  punyaPassword: boolean;
  providers: string[];
}

export interface Pending {
  id: number;
  jenis: string;
  payload: Record<string, unknown>;
  kedaluwarsaPada: number; // epoch ms
}
