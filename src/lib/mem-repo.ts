import type { Repo } from "./repo";
import {
  SEED_CONFIG_DEFAULT,
  SEED_DD,
  SEED_GRUP,
  SEED_INVESTASI,
  SEED_NAMA_JAJAN,
  SEED_SUBPOS,
  SEED_TABUNGAN,
} from "./seed";
import { parseConfig } from "./engine";
import type { Debt, NewDebt, NewTx, Pending, PlanItem, State, Tx } from "./types";

interface Data {
  allowed: string[];
  config: Record<string, string>;
  groups: State["groups"];
  subPosts: State["subPosts"];
  aliases: State["aliases"];
  plans: State["plans"];
  txs: Tx[];
  debts: Debt[];
  pendings: (Pending & { status: string })[];
  inbound: Map<string, string>;
  seq: { tx: number; plan: number; sub: number; pending: number; debt: number };
}

/** Implementasi dalam memori, dipakai pengujian. Perilakunya mengikuti PgRepo. */
export class MemRepo implements Repo {
  private d: Data;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(allowed: string[] = ["628111"]) {
    this.d = {
      allowed,
      config: { ...SEED_CONFIG_DEFAULT },
      groups: [],
      subPosts: [],
      aliases: [],
      plans: [],
      txs: [],
      debts: [],
      pendings: [],
      inbound: new Map(),
      seq: { tx: 0, plan: 0, sub: 0, pending: 0, debt: 0 },
    };
    this.seed();
  }

  private seed() {
    const d = this.d;
    SEED_GRUP.forEach((nama, i) => d.groups.push({ id: i + 1, nama, urutan: i + 1 }));
    const items: PlanItem[] = [];
    SEED_SUBPOS.forEach((s, i) => {
      const id = ++d.seq.sub;
      const grup = d.groups.find((g) => g.nama === s.grup)!;
      d.subPosts.push({ id, groupId: grup.id, nama: s.nama, kategori: null, aktif: true, urutan: i + 1 });
      for (const a of s.alias) d.aliases.push({ alias: a, subPostId: id });
      items.push({ tipe: "sub_pos", subPostId: id, nominal: s.jatah });
      if (s.nama === SEED_NAMA_JAJAN) d.config.bonus_subpos_id = String(id);
    });
    items.push({ tipe: "dd", subPostId: null, nominal: SEED_DD });
    items.push({ tipe: "tabungan", subPostId: null, nominal: SEED_TABUNGAN });
    items.push({ tipe: "investasi", subPostId: null, nominal: SEED_INVESTASI });
    d.plans.push({ id: ++d.seq.plan, nama: "Draft 1", status: "aktif", items });
  }

  async load(): Promise<State> {
    const d = this.d;
    return structuredClone({
      config: parseConfig(d.config),
      groups: d.groups,
      subPosts: d.subPosts,
      aliases: d.aliases,
      plans: d.plans,
      txs: d.txs,
      debts: d.debts,
    });
  }

  async isAllowed(wa: string) {
    return this.d.allowed.includes(wa);
  }

  async transaction<T>(fn: (r: Repo) => Promise<T>): Promise<T> {
    const run = async () => {
      const snap = structuredClone({ ...this.d, inbound: [...this.d.inbound] });
      try {
        return await fn(this);
      } catch (e) {
        this.d = { ...snap, inbound: new Map(snap.inbound) } as Data;
        throw e;
      }
    };
    const p = this.chain.then(run, run);
    this.chain = p.catch(() => undefined);
    return p;
  }

  async tryRecordInbound(id: string) {
    if (this.d.inbound.has(id)) return false;
    this.d.inbound.set(id, "");
    return true;
  }
  async setInboundResult(id: string, hasil: string) {
    this.d.inbound.set(id, hasil);
  }

  async insertTx(tx: NewTx) {
    const id = ++this.d.seq.tx;
    this.d.txs.push({ ...tx, id, status: tx.status ?? "berlaku" });
    return id;
  }
  async updateTx(id: number, patch: { status?: "berlaku" | "batal"; subPostId?: number | null }) {
    const t = this.d.txs.find((x) => x.id === id);
    if (!t) return;
    if (patch.status) t.status = patch.status;
    if (patch.subPostId !== undefined) t.subPostId = patch.subPostId;
  }
  async setGajiPlan(txId: number, planVersionId: number) {
    const t = this.d.txs.find((x) => x.id === txId);
    if (t) t.planVersionId = planVersionId;
  }

  async setConfig(k: string, v: string) {
    this.d.config[k] = v;
  }

  async createPlanVersion(nama: string, status: "aktif" | "usulan" | "arsip", items: PlanItem[]) {
    const id = ++this.d.seq.plan;
    this.d.plans.push({ id, nama, status, items: structuredClone(items) });
    return id;
  }
  async setPlanStatus(id: number, status: "aktif" | "usulan" | "arsip") {
    const p = this.d.plans.find((x) => x.id === id);
    if (p) p.status = status;
  }

  async addSubPost(groupId: number, nama: string) {
    const id = ++this.d.seq.sub;
    this.d.subPosts.push({ id, groupId, nama, kategori: null, aktif: true, urutan: id });
    return id;
  }
  async renameSubPost(id: number, nama: string) {
    const s = this.d.subPosts.find((x) => x.id === id);
    if (s) s.nama = nama;
  }
  async deactivateSubPost(id: number) {
    const s = this.d.subPosts.find((x) => x.id === id);
    if (s) s.aktif = false;
  }
  async addAlias(subPostId: number, alias: string) {
    if (!this.d.aliases.some((a) => a.alias === alias)) this.d.aliases.push({ alias, subPostId });
  }

  async addDebt(d: NewDebt) {
    const id = ++this.d.seq.debt;
    this.d.debts.push({ ...d, id, status: d.status ?? "aktif" });
    return id;
  }

  async updateDebt(id: number, patch: { dibayar?: number; status?: Debt["status"] }) {
    const d = this.d.debts.find((x) => x.id === id);
    if (!d) return;
    if (patch.dibayar !== undefined) d.dibayar = patch.dibayar;
    if (patch.status !== undefined) d.status = patch.status;
  }

  async addPending(jenis: string, payload: Record<string, unknown>, kedaluwarsaPada: number) {
    const id = ++this.d.seq.pending;
    this.d.pendings.push({ id, jenis, payload, kedaluwarsaPada, status: "menunggu" });
    return id;
  }
  async getPending(jenis: string[]) {
    const rows = this.d.pendings.filter((p) => p.status === "menunggu" && jenis.includes(p.jenis));
    return rows.length ? structuredClone(rows[rows.length - 1]) : null;
  }
  async resolvePending(id: number, status: "selesai" | "batal" | "kedaluwarsa") {
    const p = this.d.pendings.find((x) => x.id === id);
    if (p) p.status = status;
  }
  async consumeExport(hash: string, nowMs: number) {
    const p = this.d.pendings.find(
      (x) => x.jenis === "ekspor" && x.status === "menunggu" && x.payload.hash === hash,
    );
    if (!p || p.kedaluwarsaPada < nowMs) return false;
    p.status = "selesai";
    return true;
  }
}
