import { Pool, types, type PoolClient } from "pg";
import type { Repo } from "./repo";
import { parseConfig } from "./engine";
import {
  SEED_CONFIG_DEFAULT,
  SEED_DD,
  SEED_GRUP,
  SEED_INVESTASI,
  SEED_NAMA_JAJAN,
  SEED_SUBPOS,
  SEED_TABUNGAN,
} from "./seed";
import type { Debt, NewDebt, NewTx, Pending, PlanItem, State, Tx, Wadah } from "./types";

// bigint (int8) -> number, date -> string 'YYYY-MM-DD' (hindari konversi zona waktu)
types.setTypeParser(20, (v) => Number(v));
types.setTypeParser(1082, (v) => v);

const LOCK_KEY = 727001; // satu pemilik = satu kunci

interface Q {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;
}

let pool: Pool | null = null;
export function getPool(): Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL belum diatur");
    pool = new Pool({ connectionString: url, max: 1, idleTimeoutMillis: 10_000 });
  }
  return pool;
}

export class PgRepo implements Repo {
  constructor(private db: Q = getPool(), private inTx = false) {}

  async load(): Promise<State> {
    const q = (t: string) => this.db.query(t).then((r) => r.rows);
    const [cfg, groups, subs, aliases, plans, items, txs, debts] = await Promise.all([
      q("SELECT kunci, nilai FROM config"),
      q("SELECT id, nama, urutan FROM groups ORDER BY urutan, id"),
      q("SELECT id, group_id, nama, kategori, aktif, urutan FROM sub_posts ORDER BY urutan, id"),
      q("SELECT alias, sub_post_id FROM aliases ORDER BY id"),
      q("SELECT id, nama, status FROM plan_versions ORDER BY id"),
      q("SELECT plan_version_id, tipe, sub_post_id, nominal FROM plan_items ORDER BY id"),
      q("SELECT * FROM transactions ORDER BY id"),
      q("SELECT * FROM debts ORDER BY id"),
    ]);
    const config = parseConfig(Object.fromEntries(cfg.map((r) => [r.kunci, r.nilai])));
    return {
      config,
      groups: groups.map((g) => ({ id: g.id, nama: g.nama, urutan: g.urutan })),
      subPosts: subs.map((s) => ({
        id: s.id,
        groupId: s.group_id,
        nama: s.nama,
        kategori: s.kategori,
        aktif: s.aktif,
        urutan: s.urutan,
      })),
      aliases: aliases.map((a) => ({ alias: a.alias, subPostId: a.sub_post_id })),
      plans: plans.map((p) => ({
        id: p.id,
        nama: p.nama,
        status: p.status,
        items: items
          .filter((i) => i.plan_version_id === p.id)
          .map((i) => ({ tipe: i.tipe, subPostId: i.sub_post_id, nominal: i.nominal })),
      })),
      txs: txs.map(
        (t): Tx => ({
          id: t.id,
          tipe: t.tipe,
          nominal: t.nominal,
          biayaAdmin: t.biaya_admin ?? 0,
          subPostId: t.sub_post_id,
          subPostIdTujuan: t.sub_post_id_tujuan,
          wadahAsal: t.wadah_asal as Wadah | null,
          wadahTujuan: t.wadah_tujuan as Wadah | null,
          tanggal: t.tanggal,
          label: t.label,
          sumber: t.sumber,
          status: t.status,
          penggantiDari: t.pengganti_dari,
          indukId: t.induk_id,
          planVersionId: t.plan_version_id,
          waMessageId: t.wa_message_id,
        }),
      ),
      debts: debts.map(
        (d): Debt => ({
          id: d.id,
          jenis: d.jenis,
          nama: d.nama,
          nominal: d.nominal,
          dibayar: d.dibayar,
          tanggal: d.tanggal,
          jatuhTempo: d.jatuh_tempo,
          catatan: d.catatan,
          status: d.status,
        }),
      ),
    };
  }

  async isAllowed(wa: string) {
    const r = await this.db.query("SELECT 1 FROM allowed_numbers WHERE wa_number = $1 AND aktif", [wa]);
    return (r.rowCount ?? 0) > 0;
  }

  async transaction<T>(fn: (r: Repo) => Promise<T>): Promise<T> {
    if (this.inTx) return fn(this);
    const client: PoolClient = await getPool().connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock($1)", [LOCK_KEY]);
      const out = await fn(new PgRepo(client, true));
      await client.query("COMMIT");
      return out;
    } catch (e) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
  }

  async tryRecordInbound(id: string) {
    const r = await this.db.query(
      "INSERT INTO inbound_messages (wa_message_id) VALUES ($1) ON CONFLICT DO NOTHING",
      [id],
    );
    return (r.rowCount ?? 0) > 0;
  }
  async setInboundResult(id: string, hasil: string) {
    await this.db.query("UPDATE inbound_messages SET hasil = $2 WHERE wa_message_id = $1", [id, hasil]);
  }

  async insertTx(t: NewTx) {
    const r = await this.db.query(
      `INSERT INTO transactions
        (tipe, nominal, biaya_admin, sub_post_id, sub_post_id_tujuan, wadah_asal, wadah_tujuan, tanggal, label,
         sumber, status, pengganti_dari, induk_id, plan_version_id, wa_message_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
      [
        t.tipe, t.nominal, t.biayaAdmin ?? 0, t.subPostId, t.subPostIdTujuan, t.wadahAsal, t.wadahTujuan, t.tanggal,
        t.label, t.sumber, t.status ?? "berlaku", t.penggantiDari, t.indukId, t.planVersionId, t.waMessageId,
      ],
    );
    return r.rows[0].id as number;
  }
  async updateTx(id: number, patch: { status?: "berlaku" | "batal"; subPostId?: number | null }) {
    if (patch.status) await this.db.query("UPDATE transactions SET status = $2 WHERE id = $1", [id, patch.status]);
    if (patch.subPostId !== undefined)
      await this.db.query("UPDATE transactions SET sub_post_id = $2 WHERE id = $1", [id, patch.subPostId]);
  }
  async setGajiPlan(txId: number, planVersionId: number) {
    await this.db.query("UPDATE transactions SET plan_version_id = $2 WHERE id = $1", [txId, planVersionId]);
  }

  async setConfig(k: string, v: string) {
    await this.db.query(
      "INSERT INTO config (kunci, nilai) VALUES ($1,$2) ON CONFLICT (kunci) DO UPDATE SET nilai = EXCLUDED.nilai",
      [k, v],
    );
  }

  async createPlanVersion(nama: string, status: "aktif" | "usulan" | "arsip", items: PlanItem[]) {
    const r = await this.db.query("INSERT INTO plan_versions (nama, status) VALUES ($1,$2) RETURNING id", [nama, status]);
    const id = r.rows[0].id as number;
    for (const it of items) {
      await this.db.query(
        "INSERT INTO plan_items (plan_version_id, tipe, sub_post_id, nominal) VALUES ($1,$2,$3,$4)",
        [id, it.tipe, it.subPostId, it.nominal],
      );
    }
    return id;
  }
  async setPlanStatus(id: number, status: "aktif" | "usulan" | "arsip") {
    await this.db.query("UPDATE plan_versions SET status = $2 WHERE id = $1", [id, status]);
  }

  async addSubPost(groupId: number, nama: string) {
    const r = await this.db.query(
      "INSERT INTO sub_posts (group_id, nama, urutan) VALUES ($1,$2,(SELECT COALESCE(MAX(urutan),0)+1 FROM sub_posts)) RETURNING id",
      [groupId, nama],
    );
    return r.rows[0].id as number;
  }
  async renameSubPost(id: number, nama: string) {
    await this.db.query("UPDATE sub_posts SET nama = $2 WHERE id = $1", [id, nama]);
  }
  async deactivateSubPost(id: number) {
    await this.db.query("UPDATE sub_posts SET aktif = FALSE WHERE id = $1", [id]);
  }
  async addAlias(subPostId: number, alias: string) {
    await this.db.query("INSERT INTO aliases (sub_post_id, alias) VALUES ($1,$2) ON CONFLICT DO NOTHING", [
      subPostId,
      alias,
    ]);
  }

  async addDebt(d: NewDebt) {
    const r = await this.db.query(
      `INSERT INTO debts (jenis, nama, nominal, dibayar, tanggal, jatuh_tempo, catatan, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [d.jenis, d.nama, d.nominal, d.dibayar, d.tanggal, d.jatuhTempo, d.catatan, d.status ?? "aktif"],
    );
    return r.rows[0].id as number;
  }
  async updateDebt(id: number, patch: { dibayar?: number; status?: Debt["status"] }) {
    if (patch.dibayar !== undefined) await this.db.query("UPDATE debts SET dibayar = $2 WHERE id = $1", [id, patch.dibayar]);
    if (patch.status !== undefined) await this.db.query("UPDATE debts SET status = $2 WHERE id = $1", [id, patch.status]);
  }

  async addPending(jenis: string, payload: Record<string, unknown>, kedaluwarsaPada: number) {
    const r = await this.db.query(
      "INSERT INTO pending_actions (jenis, payload, kedaluwarsa_pada) VALUES ($1,$2,to_timestamp($3 / 1000.0)) RETURNING id",
      [jenis, JSON.stringify(payload), kedaluwarsaPada],
    );
    return r.rows[0].id as number;
  }
  async getPending(jenis: string[]): Promise<Pending | null> {
    const r = await this.db.query(
      `SELECT id, jenis, payload, (extract(epoch from kedaluwarsa_pada) * 1000)::float8 AS exp
         FROM pending_actions WHERE status = 'menunggu' AND jenis = ANY($1) ORDER BY id DESC LIMIT 1`,
      [jenis],
    );
    const row = r.rows[0];
    return row ? { id: Number(row.id), jenis: row.jenis, payload: row.payload, kedaluwarsaPada: Number(row.exp) } : null;
  }
  async resolvePending(id: number, status: "selesai" | "batal" | "kedaluwarsa") {
    await this.db.query("UPDATE pending_actions SET status = $2 WHERE id = $1", [id, status]);
  }
  async consumeExport(hash: string, nowMs: number) {
    const r = await this.db.query(
      `UPDATE pending_actions SET status = 'selesai'
        WHERE jenis = 'ekspor' AND status = 'menunggu' AND payload->>'hash' = $1
          AND kedaluwarsa_pada > to_timestamp($2 / 1000.0)
        RETURNING id`,
      [hash, nowMs],
    );
    return (r.rowCount ?? 0) > 0;
  }

  /** Dipakai script db:setup. Hanya mengisi bila belum ada data. */
  async seed(allowedNumbers: string[]) {
    for (const wa of allowedNumbers) {
      await this.db.query("INSERT INTO allowed_numbers (wa_number) VALUES ($1) ON CONFLICT DO NOTHING", [wa]);
    }
    const existing = await this.db.query("SELECT COUNT(*)::int AS n FROM groups");
    if (existing.rows[0].n > 0) return false;

    const grupId = new Map<string, number>();
    for (const [i, nama] of SEED_GRUP.entries()) {
      const r = await this.db.query("INSERT INTO groups (nama, urutan) VALUES ($1,$2) RETURNING id", [nama, i + 1]);
      grupId.set(nama, r.rows[0].id);
    }
    const items: PlanItem[] = [];
    let jajanId: number | null = null;
    for (const s of SEED_SUBPOS) {
      const id = await this.addSubPost(grupId.get(s.grup)!, s.nama);
      for (const a of s.alias) await this.addAlias(id, a);
      items.push({ tipe: "sub_pos", subPostId: id, nominal: s.jatah });
      if (s.nama === SEED_NAMA_JAJAN) jajanId = id;
    }
    items.push({ tipe: "dd", subPostId: null, nominal: SEED_DD });
    items.push({ tipe: "tabungan", subPostId: null, nominal: SEED_TABUNGAN });
    items.push({ tipe: "investasi", subPostId: null, nominal: SEED_INVESTASI });
    await this.createPlanVersion("Draft 1", "aktif", items);
    for (const [k, v] of Object.entries(SEED_CONFIG_DEFAULT)) {
      await this.db.query("INSERT INTO config (kunci, nilai) VALUES ($1,$2) ON CONFLICT DO NOTHING", [k, v]);
    }
    if (jajanId) await this.setConfig("bonus_subpos_id", String(jajanId));
    return true;
  }
}
