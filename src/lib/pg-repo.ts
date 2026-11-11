import { Pool, types, type PoolClient } from "pg";
import type { Repo } from "./repo";
import { parseConfig } from "./engine";
import { hashBaris, type HasilLedger } from "./ledger";
import {
  SEED_CONFIG_DEFAULT,
  SEED_DD,
  SEED_GRUP,
  SEED_INVESTASI,
  SEED_NAMA_JAJAN,
  SEED_SUBPOS,
  SEED_TABUNGAN,
} from "./seed";
import type { Debt, NewAkun, NewDebt, NewSavingGoal, NewTx, Pending, PlanItem, SavingGoal, State, Tx, Wadah } from "./types";

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
    pool = new Pool({ connectionString: url, max: 5, idleTimeoutMillis: 10_000 });
  }
  return pool;
}

export class PgRepo implements Repo {
  constructor(private db: Q = getPool(), private inTx = false, private userId: string | null = null) {}

  private requireUserId(): string | null {
    return this.userId;
  }

  async claimLegacyData(userId: string): Promise<number> {
    return this.transaction(async (repo) => {
      const db = repo as PgRepo;
      await db.db.query("SELECT pg_advisory_xact_lock($1)", [LOCK_KEY]);
      const users = await db.db.query("SELECT id FROM auth_users ORDER BY created_at, id LIMIT 2");
      if (users.rows.length !== 1 || users.rows[0].id !== userId) throw new Error("Legacy data claim requires the first user");
      const claimed = await db.db.query(
        "WITH moved AS (UPDATE groups SET user_id = $1 WHERE user_id IS NULL RETURNING id) SELECT count(*)::int AS n FROM moved",
        [userId],
      );
      for (const table of ["sub_posts", "aliases", "plan_versions", "plan_items", "transactions", "debts", "saving_goals"]) {
        await db.db.query(`UPDATE ${table} SET user_id = $1 WHERE user_id IS NULL`, [userId]);
      }
      await db.db.query("UPDATE config SET user_id = $1 WHERE user_id IS NULL", [userId]);
      return Number(claimed.rows[0].n);
    });
  }

  private scope(alias = ""): string {
    return `${alias ? `${alias}.` : ""}user_id = $1`;
  }

  private financeUser(): string | null {
    return this.requireUserId();
  }

  /** Hanya dipakai job tanpa sesi saat sistem benar-benar single-user; multi-user wajib punya pemetaan eksplisit. */
  async soleUserId(): Promise<string | null> {
    const r = await this.db.query("SELECT id FROM auth_users ORDER BY created_at, id LIMIT 2");
    return r.rows.length === 1 ? r.rows[0].id : null;
  }

  /** Akun pemilik nomor WhatsApp. Data tidak pernah dibagi ke akun lain. */
  async userIdForWa(wa: string): Promise<string | null> {
    try {
      const r = await this.db.query(
        "SELECT member_id FROM workspace_members WHERE wa_number = $1 AND status = 'aktif' LIMIT 1",
        [wa],
      );
      if (r.rows[0]?.member_id) return r.rows[0].member_id;
    } catch (error) {
      if ((error as { code?: string }).code !== "42P01") throw error;
    }
    const akun = await this.db.query(
      `SELECT id FROM auth_users
       WHERE regexp_replace(COALESCE(telepon, ''), '\\D', '', 'g') IN ($1, '0' || substr($1, 3), substr($1, 3))
       LIMIT 1`,
      [wa],
    );
    if (akun.rows[0]?.id) return akun.rows[0].id;
    return this.soleUserId();
  }

  /** Mencocokkan email kotak masuk dengan akun terdaftar (tidak peka huruf besar/kecil). */
  async userIdByEmail(email: string | undefined): Promise<string | null> {
    const alamat = email?.trim().toLowerCase();
    if (!alamat) return null;
    const r = await this.db.query("SELECT id FROM auth_users WHERE lower(email) = $1 LIMIT 1", [alamat]);
    return r.rows[0]?.id ?? null;
  }

  /**
   * Email kotak masuk → user. Akun pertama hanya dipakai bila sistem masih single-user;
   * setelah ada beberapa user, email yang tidak cocok tidak boleh jatuh ke akun utama.
   */
  async userIdByEmailOrSoleUser(email: string | undefined): Promise<string | null> {
    const cocok = await this.userIdByEmail(email);
    if (cocok) return cocok;
    const r = await this.db.query("SELECT id FROM auth_users ORDER BY created_at, id LIMIT 2");
    return r.rows.length === 1 ? r.rows[0].id : null;
  }

  async load(): Promise<State> {
    const userId = this.financeUser();
    const q = (t: string) => this.db.query(t, t.includes("$1") ? [userId] : undefined).then((r) => r.rows);
    const [cfg, accounts, groups, subs, aliases, plans, items, txs, debts, goals] = await Promise.all([
      q("SELECT kunci, nilai FROM config WHERE user_id IS NOT DISTINCT FROM $1"),
      q("SELECT id, nama, tipe, saldo_awal, urutan, aktif FROM accounts WHERE user_id IS NOT DISTINCT FROM $1 ORDER BY urutan, id"),
      q("SELECT id, nama, urutan FROM groups WHERE user_id IS NOT DISTINCT FROM $1 ORDER BY urutan, id"),
      q("SELECT id, group_id, nama, kategori, aktif, urutan FROM sub_posts WHERE user_id IS NOT DISTINCT FROM $1 ORDER BY urutan, id"),
      q("SELECT alias, sub_post_id FROM aliases WHERE user_id IS NOT DISTINCT FROM $1 ORDER BY id"),
      q("SELECT id, nama, status FROM plan_versions WHERE user_id IS NOT DISTINCT FROM $1 ORDER BY id"),
      q("SELECT plan_version_id, tipe, sub_post_id, nominal FROM plan_items WHERE user_id IS NOT DISTINCT FROM $1 ORDER BY id"),
      q("SELECT * FROM transactions WHERE user_id IS NOT DISTINCT FROM $1 ORDER BY id"),
      q("SELECT * FROM debts WHERE user_id IS NOT DISTINCT FROM $1 ORDER BY id"),
      q("SELECT * FROM saving_goals WHERE user_id IS NOT DISTINCT FROM $1 ORDER BY id"),
    ]);
    const config = parseConfig(Object.fromEntries(cfg.map((r) => [r.kunci, r.nilai])));
    return {
      config,
      accounts: accounts.map((a) => ({
        id: a.id,
        nama: a.nama,
        tipe: a.tipe,
        saldoAwal: a.saldo_awal,
        urutan: a.urutan,
        aktif: a.aktif,
      })),
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
          accountId: t.account_id ?? null,
          accountIdTujuan: t.account_id_tujuan ?? null,
          tanggal: t.tanggal,
          label: t.label,
          detail: t.detail && typeof t.detail === "object" && !Array.isArray(t.detail) ? t.detail : null,
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
      goals: goals.map(
        (g): SavingGoal => ({
          id: g.id,
          nama: g.nama,
          targetNominal: g.target_nominal,
          terkumpul: g.terkumpul,
          tanggal: g.tanggal,
          targetTanggal: g.target_tanggal,
          catatan: g.catatan,
          status: g.status,
        }),
      ),
    };
  }

  async isAllowed(wa: string) {
    const r = await this.db.query(
      `SELECT 1 FROM allowed_numbers WHERE wa_number = $1 AND aktif
       UNION ALL
       SELECT 1 FROM auth_users
       WHERE regexp_replace(COALESCE(telepon, ''), '\\D', '', 'g') IN ($1, '0' || substr($1, 3), substr($1, 3))
       LIMIT 1`,
      [wa],
    );
    return (r.rowCount ?? 0) > 0;
  }

  async transaction<T>(fn: (r: Repo) => Promise<T>): Promise<T> {
    if (this.inTx) return fn(this);
    const client: PoolClient = await getPool().connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock($1)", [LOCK_KEY]);
      const out = await fn(new PgRepo(client, true, this.userId));
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
  async addOutbox(waNumber: string, pesan: string) {
    const r = await this.db.query(
      "INSERT INTO outbox (wa_number, pesan) VALUES ($1, $2) RETURNING id",
      [waNumber, pesan],
    );
    return Number(r.rows[0].id);
  }

  async insertTx(t: NewTx) {
    const r = await this.db.query(
      `INSERT INTO transactions
        (user_id, tipe, nominal, biaya_admin, sub_post_id, sub_post_id_tujuan, wadah_asal, wadah_tujuan, account_id, account_id_tujuan,
         tanggal, label, detail, sumber, status, pengganti_dari, induk_id, plan_version_id, wa_message_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING id`,
      [
        this.financeUser(), t.tipe, t.nominal, t.biayaAdmin ?? 0, t.subPostId, t.subPostIdTujuan, t.wadahAsal, t.wadahTujuan,
        t.accountId, t.accountIdTujuan, t.tanggal, t.label, t.detail ? JSON.stringify(t.detail) : "{}", t.sumber,
        t.status ?? "berlaku", t.penggantiDari, t.indukId, t.planVersionId, t.waMessageId,
      ],
    );
    const id = r.rows[0].id as number;
    await this.rechainFrom(id);
    return id;
  }

  /** Hitung ulang hash baris mulai id ini sampai terakhir (update status ikut mengubah rantai). */
  private async rechainFrom(id: number) {
    const userId = this.financeUser();
    const before = await this.db.query(
      "SELECT hash FROM transactions WHERE user_id IS NOT DISTINCT FROM $1 AND id < $2 ORDER BY id DESC LIMIT 1",
      [userId, id],
    );
    let prev = (before.rows[0]?.hash as string | null) ?? "";
    const rows = await this.db.query(
      "SELECT * FROM transactions WHERE user_id IS NOT DISTINCT FROM $1 AND id >= $2 ORDER BY id",
      [userId, id],
    );
    for (const row of rows.rows) {
      const hash = hashBaris(row, prev || null);
      await this.db.query("UPDATE transactions SET hash_prev = $2, hash = $3 WHERE id = $1", [row.id, prev || null, hash]);
      prev = hash;
    }
    const kepala = await this.db.query(
      "SELECT id, hash FROM transactions WHERE user_id IS NOT DISTINCT FROM $1 ORDER BY id DESC LIMIT 1",
      [userId],
    );
    const jumlah = await this.db.query(
      "SELECT COUNT(*)::bigint AS n FROM transactions WHERE user_id IS NOT DISTINCT FROM $1",
      [userId],
    );
    await this.db.query(
      `INSERT INTO ledger_anchors (user_id, tx_id, tx_count, root, diperbarui_pada)
       VALUES ($1,$2,$3,$4,now())
       ON CONFLICT (user_id) DO UPDATE
       SET tx_id = EXCLUDED.tx_id, tx_count = EXCLUDED.tx_count, root = EXCLUDED.root, diperbarui_pada = now()`,
      [userId, kepala.rows[0]?.id ?? null, jumlah.rows[0]?.n ?? 0, kepala.rows[0]?.hash ?? null],
    );
  }

  /** Mengisi hash untuk transaksi lama setelah migrasi/skema baru. */
  async backfillLedger() {
    await this.rechainFrom(0);
  }

  /** Backfill sekali jalan bila masih ada transaksi lama tanpa hash. */
  async ensureLedger() {
    if (!(await this.cek()).rows.length) return;
    await this.transaction(async (r) => {
      const db = r as PgRepo;
      if ((await db.cek()).rows.length) await db.backfillLedger();
    });
  }

  private cek() {
    return this.db.query(
      "SELECT 1 FROM transactions WHERE user_id IS NOT DISTINCT FROM $1 AND hash IS NULL LIMIT 1",
      [this.financeUser()],
    );
  }

  /** Periksa utuh/tidaknya rantai hash milik user ini. */
  async verifyLedger(): Promise<HasilLedger> {
    const userId = this.financeUser();
    const rows = await this.db.query(
      "SELECT * FROM transactions WHERE user_id IS NOT DISTINCT FROM $1 ORDER BY id",
      [userId],
    );
    let prev = "";
    for (const row of rows.rows) {
      const hash = hashBaris(row, prev || null);
      if ((row.hash_prev ?? "") !== prev || row.hash !== hash) {
        return { ok: false, jumlah: rows.rows.length, akar: prev || null, rusak: Number(row.id) };
      }
      prev = hash;
    }
    return { ok: true, jumlah: rows.rows.length, akar: prev || null, rusak: null };
  }

  async updateTx(id: number, patch: {
    status?: "berlaku" | "batal";
    subPostId?: number | null;
    nominal?: number;
    biayaAdmin?: number;
    tanggal?: string;
    label?: string | null;
    accountId?: number | null;
  }) {
    const sets: string[] = [];
    const nilai: unknown[] = [];
    const tambah = (kolom: string, v: unknown) => {
      nilai.push(v);
      sets.push(`${kolom} = $${nilai.length}`);
    };
    if (patch.status !== undefined) tambah("status", patch.status);
    if (patch.subPostId !== undefined) tambah("sub_post_id", patch.subPostId);
    if (patch.nominal !== undefined) tambah("nominal", patch.nominal);
    if (patch.biayaAdmin !== undefined) tambah("biaya_admin", patch.biayaAdmin);
    if (patch.tanggal !== undefined) tambah("tanggal", patch.tanggal);
    if (patch.label !== undefined) tambah("label", patch.label);
    if (patch.accountId !== undefined) tambah("account_id", patch.accountId);
    if (!sets.length) return;
    const idParam = nilai.length + 1;
    const userParam = nilai.length + 2;
    await this.db.query(
      `UPDATE transactions SET ${sets.join(", ")} WHERE id = $${idParam} AND user_id IS NOT DISTINCT FROM $${userParam}`,
      [...nilai, id, this.financeUser()],
    );
    await this.rechainFrom(id);
  }
  async setGajiPlan(txId: number, planVersionId: number) {
    await this.db.query(
      `UPDATE transactions SET plan_version_id = $2
       WHERE id = $1 AND user_id IS NOT DISTINCT FROM $3
         AND EXISTS (SELECT 1 FROM plan_versions WHERE id = $2 AND user_id IS NOT DISTINCT FROM $3)`,
      [txId, planVersionId, this.financeUser()],
    );
    await this.rechainFrom(txId);
  }

  async setConfig(k: string, v: string) {
    const userId = this.financeUser();
    if (userId) {
      await this.db.query(
        `INSERT INTO config (user_id, kunci, nilai) VALUES ($1,$2,$3)
         ON CONFLICT (user_id, kunci) WHERE user_id IS NOT NULL
         DO UPDATE SET nilai = EXCLUDED.nilai`,
        [userId, k, v],
      );
    } else {
      await this.db.query(
        `INSERT INTO config (user_id, kunci, nilai) VALUES (NULL,$1,$2)
         ON CONFLICT (kunci) WHERE user_id IS NULL
         DO UPDATE SET nilai = EXCLUDED.nilai`,
        [k, v],
      );
    }
  }

  async createPlanVersion(nama: string, status: "aktif" | "usulan" | "arsip", items: PlanItem[]) {
    const userId = this.financeUser();
    const subIds = items.map((i) => i.subPostId).filter((x): x is number => x !== null);
    if (subIds.length) {
      const found = await this.db.query(
        "SELECT id FROM sub_posts WHERE user_id IS NOT DISTINCT FROM $1 AND id = ANY($2::int[])",
        [userId, subIds],
      );
      const tersedia = new Set(found.rows.map((r) => r.id as number));
      if (subIds.some((id) => !tersedia.has(id))) throw new Error("Plan item references an unavailable sub-post");
    }
    const r = await this.db.query("INSERT INTO plan_versions (user_id, nama, status) VALUES ($1,$2,$3) RETURNING id", [userId, nama, status]);
    const id = r.rows[0].id as number;
    if (items.length) {
      await this.db.query(
        `INSERT INTO plan_items (user_id, plan_version_id, tipe, sub_post_id, nominal)
         SELECT $1, $2, t.tipe, t.sub_post_id, t.nominal
         FROM unnest($3::text[], $4::int[], $5::bigint[]) AS t(tipe, sub_post_id, nominal)`,
        [userId, id, items.map((i) => i.tipe), items.map((i) => i.subPostId), items.map((i) => i.nominal)],
      );
    }
    return id;
  }
  async setPlanStatus(id: number, status: "aktif" | "usulan" | "arsip") {
    await this.db.query("UPDATE plan_versions SET status = $2 WHERE id = $1 AND user_id IS NOT DISTINCT FROM $3", [id, status, this.financeUser()]);
  }

  async addSubPost(groupId: number, nama: string) {
    const userId = this.financeUser();
    const r = await this.db.query(
      `INSERT INTO sub_posts (user_id, group_id, nama, urutan)
       SELECT $1, g.id, $3, (SELECT COALESCE(MAX(urutan),0)+1 FROM sub_posts WHERE user_id IS NOT DISTINCT FROM $1)
       FROM groups g WHERE g.id = $2 AND g.user_id IS NOT DISTINCT FROM $1 RETURNING id`,
      [userId, groupId, nama],
    );
    if (!r.rows[0]) throw new Error("Group is not available to this owner");
    return r.rows[0].id as number;
  }
  async renameSubPost(id: number, nama: string) {
    await this.db.query("UPDATE sub_posts SET nama = $2 WHERE id = $1 AND user_id IS NOT DISTINCT FROM $3", [id, nama, this.financeUser()]);
  }
  async deactivateSubPost(id: number) {
    await this.db.query("UPDATE sub_posts SET aktif = FALSE WHERE id = $1 AND user_id IS NOT DISTINCT FROM $2", [id, this.financeUser()]);
  }
  async addAlias(subPostId: number, alias: string) {
    const r = await this.db.query(
      `INSERT INTO aliases (user_id, sub_post_id, alias)
       SELECT $1, id, $3 FROM sub_posts WHERE id = $2 AND user_id IS NOT DISTINCT FROM $1
       ON CONFLICT DO NOTHING RETURNING id`,
      [this.financeUser(), subPostId, alias],
    );
    if (r.rowCount === 0) {
      const existing = await this.db.query(
        "SELECT 1 FROM sub_posts WHERE id = $1 AND user_id IS NOT DISTINCT FROM $2",
        [subPostId, this.financeUser()],
      );
      if (existing.rowCount === 0) throw new Error("Sub-post is not available to this owner");
    }
  }

  async addAccount(a: NewAkun) {
    const userId = this.financeUser();
    const r = await this.db.query(
      `INSERT INTO accounts (user_id, nama, tipe, saldo_awal, urutan)
       VALUES ($1,$2,$3,$4, COALESCE($5, (SELECT COALESCE(MAX(urutan),0)+1 FROM accounts WHERE user_id IS NOT DISTINCT FROM $1)))
       RETURNING id`,
      [userId, a.nama, a.tipe, a.saldoAwal, a.urutan ?? null],
    );
    return Number(r.rows[0].id);
  }

  async addDebt(d: NewDebt) {
    const r = await this.db.query(
      `INSERT INTO debts (user_id, jenis, nama, nominal, dibayar, tanggal, jatuh_tempo, catatan, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [this.financeUser(), d.jenis, d.nama, d.nominal, d.dibayar, d.tanggal, d.jatuhTempo, d.catatan, d.status ?? "aktif"],
    );
    return r.rows[0].id as number;
  }
  async updateDebt(id: number, patch: { dibayar?: number; status?: Debt["status"] }) {
    if (patch.dibayar !== undefined) await this.db.query("UPDATE debts SET dibayar = $2 WHERE id = $1 AND user_id IS NOT DISTINCT FROM $3", [id, patch.dibayar, this.financeUser()]);
    if (patch.status !== undefined) await this.db.query("UPDATE debts SET status = $2 WHERE id = $1 AND user_id IS NOT DISTINCT FROM $3", [id, patch.status, this.financeUser()]);
  }

  async addGoal(g: NewSavingGoal) {
    const r = await this.db.query(
      `INSERT INTO saving_goals (user_id, nama, target_nominal, terkumpul, tanggal, target_tanggal, catatan, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [this.financeUser(), g.nama, g.targetNominal, g.terkumpul ?? 0, g.tanggal, g.targetTanggal, g.catatan, g.status ?? "aktif"],
    );
    return r.rows[0].id as number;
  }
  async updateGoal(id: number, patch: { terkumpul?: number; status?: SavingGoal["status"] }) {
    if (patch.terkumpul !== undefined) await this.db.query("UPDATE saving_goals SET terkumpul = $2 WHERE id = $1 AND user_id IS NOT DISTINCT FROM $3", [id, patch.terkumpul, this.financeUser()]);
    if (patch.status !== undefined) await this.db.query("UPDATE saving_goals SET status = $2 WHERE id = $1 AND user_id IS NOT DISTINCT FROM $3", [id, patch.status, this.financeUser()]);
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

  /** Dipakai script db:setup. Melengkapi data bawaan yang belum ada, atomik. */
  async seed(allowedNumbers: string[]) {
    for (const wa of allowedNumbers) {
      await this.db.query("INSERT INTO allowed_numbers (wa_number) VALUES ($1) ON CONFLICT DO NOTHING", [wa]);
    }
    return this.transaction(async (repo) => {
      const db = repo as PgRepo;
      const userId = db.financeUser();
      const active = await db.db.query(
        "SELECT 1 FROM plan_versions WHERE user_id IS NOT DISTINCT FROM $1 AND status = 'aktif' LIMIT 1",
        [userId],
      );
      if ((active.rowCount ?? 0) > 0) return false;

      const grupId = new Map<string, number>();
      for (const [i, nama] of SEED_GRUP.entries()) {
        const inserted = await db.db.query(
          `INSERT INTO groups (user_id, nama, urutan)
           SELECT $1, $2, $3
           WHERE NOT EXISTS (SELECT 1 FROM groups WHERE user_id IS NOT DISTINCT FROM $1 AND nama = $2)
           RETURNING id`,
          [userId, nama, i + 1],
        );
        const id =
          inserted.rows[0]?.id ??
          (await db.db.query("SELECT id FROM groups WHERE user_id IS NOT DISTINCT FROM $1 AND nama = $2 LIMIT 1", [userId, nama])).rows[0].id;
        grupId.set(nama, id);
      }
      const items: PlanItem[] = [];
      let jajanId: number | null = null;
      for (const s of SEED_SUBPOS) {
        const existing = await db.db.query(
          "SELECT id FROM sub_posts WHERE user_id IS NOT DISTINCT FROM $1 AND nama = $2 LIMIT 1",
          [userId, s.nama],
        );
        const id = existing.rows[0]?.id ?? (await db.addSubPost(grupId.get(s.grup)!, s.nama));
        if (existing.rows[0]) {
          await db.db.query("UPDATE sub_posts SET group_id = $2 WHERE id = $1 AND user_id IS NOT DISTINCT FROM $3", [id, grupId.get(s.grup)!, userId]);
        }
        for (const a of s.alias) await db.addAlias(id, a);
        items.push({ tipe: "sub_pos", subPostId: id, nominal: s.jatah });
        if (s.nama === SEED_NAMA_JAJAN) jajanId = id;
      }
      items.push({ tipe: "dd", subPostId: null, nominal: SEED_DD });
      items.push({ tipe: "tabungan", subPostId: null, nominal: SEED_TABUNGAN });
      items.push({ tipe: "investasi", subPostId: null, nominal: SEED_INVESTASI });
      await db.createPlanVersion("Draft 1", "aktif", items);
      for (const [k, v] of Object.entries(SEED_CONFIG_DEFAULT)) {
        await db.db.query("INSERT INTO config (user_id, kunci, nilai) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [userId, k, v]);
      }
      if (jajanId) await db.setConfig("bonus_subpos_id", String(jajanId));
      return true;
    });
  }
}
