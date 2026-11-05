import type { Debt, NewDebt, NewSavingGoal, NewTx, Pending, PlanItem, SavingGoal, State } from "./types";

/**
 * Akses data. Semua aturan uang ada di engine.ts (fungsi murni); Repo hanya menyimpan
 * dan memuat. Ada dua implementasi: PgRepo (Neon) dan MemRepo (untuk pengujian).
 */
export interface Repo {
  load(): Promise<State>;
  isAllowed(waNumber: string): Promise<boolean>;

  /** Menjalankan fn dalam satu transaksi dengan kunci per pemilik (FR-81, NFR-04). */
  transaction<T>(fn: (r: Repo) => Promise<T>): Promise<T>;

  /** true bila pesan baru, false bila ID Meta ini sudah pernah diproses (FR-80). */
  tryRecordInbound(waMessageId: string): Promise<boolean>;
  setInboundResult(waMessageId: string, hasil: string): Promise<void>;
  addOutbox(waNumber: string, pesan: string): Promise<number>;

  insertTx(tx: NewTx): Promise<number>;
  updateTx(id: number, patch: { status?: "berlaku" | "batal"; subPostId?: number | null }): Promise<void>;
  setGajiPlan(txId: number, planVersionId: number): Promise<void>;

  addDebt(d: NewDebt): Promise<number>;
  updateDebt(id: number, patch: { dibayar?: number; status?: Debt["status"] }): Promise<void>;

  addGoal(g: NewSavingGoal): Promise<number>;
  updateGoal(id: number, patch: { terkumpul?: number; status?: SavingGoal["status"] }): Promise<void>;

  setConfig(kunci: string, nilai: string): Promise<void>;

  createPlanVersion(nama: string, status: "aktif" | "usulan" | "arsip", items: PlanItem[]): Promise<number>;
  setPlanStatus(id: number, status: "aktif" | "usulan" | "arsip"): Promise<void>;

  addSubPost(groupId: number, nama: string): Promise<number>;
  renameSubPost(id: number, nama: string): Promise<void>;
  deactivateSubPost(id: number): Promise<void>;
  addAlias(subPostId: number, alias: string): Promise<void>;

  addPending(jenis: string, payload: Record<string, unknown>, kedaluwarsaPada: number): Promise<number>;
  /** Pending terbaru berstatus menunggu untuk salah satu jenis (kedaluwarsa dicek pemanggil). */
  getPending(jenis: string[]): Promise<Pending | null>;
  resolvePending(id: number, status: "selesai" | "batal" | "kedaluwarsa"): Promise<void>;
  /** Tandai token ekspor terpakai. true bila valid, belum terpakai, dan belum kedaluwarsa (NFR-10). */
  consumeExport(hash: string, nowMs: number): Promise<boolean>;
}
