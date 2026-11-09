import {
  aktifPlan,
  bagiBonus,
  hitungAkun,
  hitungWadah,
  nominalItem,
  periodes,
  planById,
  totalPlan,
} from "./engine";
import { diffDays } from "./parse/date";
import { norm } from "./parse/pos";
import type { Repo } from "./repo";
import {
  TIPE_AKUN,
  TURUNAN,
  WADAH,
  buatTx,
  type AkunTipe,
  type DebtJenis,
  type PlanItem,
  type State,
  type TxTipe,
  type Wadah,
} from "./types";

export class AksiError extends Error {}

const TIPE_RENCANA = new Set<PlanItem["tipe"]>(["sub_pos", "dd", "tabungan", "investasi"]);
const TIPE_TRANSAKSI = new Set(["out", "in", "gaji", "bonus", "tarik", "pindah"]);

function bulat(n: unknown, bolehNol: boolean): number {
  const v = typeof n === "string" ? Number(n) : n;
  if (typeof v !== "number" || !Number.isFinite(v) || !Number.isInteger(v)) {
    throw new AksiError("Nominal harus bilangan bulat.");
  }
  if (v < 0 || (!bolehNol && v === 0)) {
    throw new AksiError(bolehNol ? "Nominal tidak boleh negatif." : "Nominal harus lebih dari 0.");
  }
  return v;
}

function tanggalSah(s: unknown, hariIni: string): string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new AksiError("Tanggal tidak valid.");
  const [y, m, d] = s.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) {
    throw new AksiError("Tanggal tidak valid.");
  }
  if (s > hariIni) throw new AksiError("Tanggal di masa depan ditolak.");
  return s;
}

function tanggalKalender(s: unknown): string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new AksiError("Tanggal tidak valid.");
  const [y, m, d] = s.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) {
    throw new AksiError("Tanggal tidak valid.");
  }
  return s;
}

function jenisDebtSah(v: unknown): DebtJenis {
  if (v !== "piutang" && v !== "utang") throw new AksiError("Jenis harus piutang atau utang.");
  return v;
}

function wadahSah(v: unknown, fallback: Wadah | null = null): Wadah {
  const w = typeof v === "string" ? v : "";
  if ((WADAH as readonly string[]).includes(w)) return w as Wadah;
  if (fallback) return fallback;
  throw new AksiError("Wadah tidak valid.");
}

function akunSah(state: State, v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const akun = state.accounts.find((a) => a.id === Number(v) && a.aktif);
  if (!akun) throw new AksiError("Dompet tidak ditemukan atau sudah nonaktif.");
  return akun.id;
}

function tarifJatah(plan: { items: PlanItem[] }): number {
  return plan.items.filter((i) => i.tipe === "sub_pos" || i.tipe === "dd").reduce((s, i) => s + i.nominal, 0);
}

async function versiBaru(r: Repo, state: State, items: PlanItem[]): Promise<number> {
  await r.setPlanStatus(aktifPlan(state).id, "arsip");
  return r.createPlanVersion(`Rencana ${state.plans.length + 1}`, "aktif", items);
}

export interface ItemRencana {
  tipe: PlanItem["tipe"];
  subPostId: number | null;
  nominal: number;
}

export async function simpanRencana(
  r: Repo,
  hariIni: string,
  items: ItemRencana[],
  sekarang: boolean,
): Promise<{ versi: number }> {
  return r.transaction(async (tx) => {
    const state = await tx.load();
    const plan = aktifPlan(state);
    const baru = plan.items.map((i) => ({ ...i }));

    const terpakai = new Set<string>();
    for (const it of items) {
      if (!TIPE_RENCANA.has(it.tipe)) throw new AksiError("Jenis rencana tidak valid.");
      const nominal = bulat(it.nominal, true);
      if (it.tipe === "sub_pos") {
        const sub = state.subPosts.find((s) => s.id === it.subPostId && s.aktif);
        if (!sub) throw new AksiError("Pos tidak ditemukan atau sudah nonaktif.");
      }
      const key = it.tipe === "sub_pos" ? `s:${it.subPostId}` : it.tipe;
      if (terpakai.has(key)) throw new AksiError("Ada pos yang dikirim lebih dari sekali.");
      terpakai.add(key);
      const target = baru.find((i) => (i.tipe === "sub_pos" ? `s:${i.subPostId}` : i.tipe) === key);
      if (target) target.nominal = nominal;
      else if (it.tipe === "sub_pos" && it.subPostId !== null) {
        baru.push({ tipe: "sub_pos", subPostId: it.subPostId, nominal });
      }
    }

    const ps = periodes(state);
    if (sekarang && ps.length) {
      for (const tipe of ["tabungan", "investasi"] as const) {
        if (nominalItem({ ...plan, items: baru }, tipe) !== nominalItem(plan, tipe)) {
          throw new AksiError(
            `Tabungan dan Investasi hanya bisa diubah mulai periode berikutnya. Untuk memindahkan dana sekarang, gunakan menu transaksi "pindah".`,
          );
        }
      }
    }

    const idBaru = await versiBaru(tx, state, baru);
    if (sekarang && ps.length) {
      const cur = ps[ps.length - 1];
      if (cur.start <= hariIni) {
        const planCur = planById(state, cur.planId);
        const delta = tarifJatah({ items: baru }) - tarifJatah(planCur);
        await tx.setGajiPlan(cur.gaji.id, idBaru);
        if (delta !== 0) {
          await tx.insertTx(
            buatTx({
              tipe: "selisih_gaji",
              nominal: Math.abs(delta),
              wadahAsal: delta > 0 ? "saldo" : null,
              wadahTujuan: delta < 0 ? "saldo" : null,
              tanggal: hariIni,
              indukId: cur.gaji.id,
            }),
          );
        }
      }
    }
    return { versi: idBaru };
  });
}

export interface InputTransaksi {
  tipe: TxTipe;
  nominal: number;
  biayaAdmin?: number;
  tanggal: string;
  label?: string | null;
  subPostId?: number | null;
  wadah?: Wadah | string | null;
  wadahAsal?: Wadah | string | null;
  wadahTujuan?: Wadah | string | null;
  accountId?: number | string | null;
  paksa?: boolean;
  detail?: Record<string, string | number | null> | null;
}

export async function tambahTransaksi(
  r: Repo,
  hariIni: string,
  input: InputTransaksi,
): Promise<{ id: number }> {
  if (!TIPE_TRANSAKSI.has(input.tipe)) throw new AksiError("Jenis transaksi tidak didukung dari web.");
  const nominal = bulat(input.nominal, false);
  const biayaAdmin = bulat(input.biayaAdmin ?? 0, true);
  if (biayaAdmin > 0 && input.tipe !== "out") throw new AksiError("Biaya admin hanya untuk pengeluaran.");
  const tanggal = tanggalSah(input.tanggal, hariIni);
  const label = typeof input.label === "string" ? input.label.trim().slice(0, 120) || null : null;

  return r.transaction(async (tx) => {
    const state = await tx.load();

    if (input.tipe === "out") {
      let subPostId: number | null = null;
      if (input.subPostId !== undefined && input.subPostId !== null) {
        const sub = state.subPosts.find((s) => s.id === Number(input.subPostId) && s.aktif);
        if (!sub) throw new AksiError("Pos tidak ditemukan atau sudah nonaktif.");
        subPostId = sub.id;
      }
      const accountId = akunSah(state, input.accountId);
      const id = await tx.insertTx(
        buatTx({ tipe: "out", nominal, biayaAdmin, subPostId, accountId, tanggal, label, detail: input.detail ?? null, sumber: "kaku" }),
      );
      return { id };
    }

    if (input.tipe === "in") {
      const tujuan = wadahSah(input.wadah, "saldo");
      const accountId = akunSah(state, input.accountId);
      const id = await tx.insertTx(
        buatTx({ tipe: "in", nominal, wadahTujuan: tujuan, accountId, tanggal, label, detail: input.detail ?? null, sumber: "kaku" }),
      );
      return { id };
    }

    if (input.tipe === "tarik" || input.tipe === "pindah") {
      const dari = wadahSah(input.wadahAsal);
      const ke = input.tipe === "tarik" ? "saldo" : wadahSah(input.wadahTujuan);
      if (dari === ke) throw new AksiError("Wadah asal dan tujuan harus berbeda.");
      const w = hitungWadah(state);
      if (dari !== "saldo" && w[dari] < nominal) {
        throw new AksiError(`Isi ${dari} hanya Rp${w[dari].toLocaleString("id-ID")}, kurang dari nominal.`);
      }
      const accountId = akunSah(state, input.accountId);
      const id = await tx.insertTx(
        buatTx({ tipe: input.tipe, nominal, wadahAsal: dari, wadahTujuan: ke, accountId, tanggal, label, detail: input.detail ?? null }),
      );
      return { id };
    }

    if (input.tipe === "gaji") {
      const ps = periodes(state);
      if (!input.paksa && ps.length) {
        const terakhir = ps[ps.length - 1].start;
        const jarak = diffDays(tanggal, terakhir);
        if (jarak < state.config.ambangGajiGanda) {
          const ket =
            jarak < 0
              ? `tanggalnya lebih awal dari gaji terakhir (${terakhir})`
              : `baru ${jarak} hari setelah gaji terakhir (${terakhir}), batas wajar ${state.config.ambangGajiGanda} hari`;
          throw new AksiError(
            `Gaji Rp${nominal.toLocaleString("id-ID")} tgl ${tanggal}: ${ket}. Centang "paksa" bila tetap ingin dicatat.`,
          );
        }
      }

      const plan = aktifPlan(state);
      const R = totalPlan(plan);
      const tab = nominalItem(plan, "tabungan");
      const inv = nominalItem(plan, "investasi");
      const accountId = akunSah(state, input.accountId);
      const gid = await tx.insertTx(
        buatTx({ tipe: "gaji", nominal, accountId, tanggal, planVersionId: plan.id, label, detail: input.detail ?? null }),
      );
      if (tab > 0) {
        await tx.insertTx(buatTx({ tipe: "alokasi_gaji", nominal: tab, wadahTujuan: "tabungan", tanggal, indukId: gid }));
      }
      if (inv > 0) {
        await tx.insertTx(buatTx({ tipe: "alokasi_gaji", nominal: inv, wadahTujuan: "investasi", tanggal, indukId: gid }));
      }
      if (nominal !== R) {
        const d = nominal - R;
        await tx.insertTx(
          buatTx({
            tipe: "selisih_gaji",
            nominal: Math.abs(d),
            wadahTujuan: d > 0 ? "saldo" : null,
            wadahAsal: d < 0 ? "saldo" : null,
            tanggal,
            indukId: gid,
          }),
        );
      }
      return { id: gid };
    }

    const ps = periodes(state);
    const berjalan = ps.length > 0 && ps[ps.length - 1].start <= hariIni;
    const accountId = akunSah(state, input.accountId);
    if (input.wadah || !berjalan) {
      const tujuan = wadahSah(input.wadah, "saldo");
      const id = await tx.insertTx(
        buatTx({ tipe: "bonus", nominal, wadahTujuan: tujuan, accountId, tanggal, label }),
      );
      return { id };
    }

    const { jajan, saldo } = bagiBonus(nominal, state.config.persenJajan);
    const subId = state.config.bonusSubPostId;
    const sub = state.subPosts.find((s) => s.id === subId && s.aktif);
    const gid = await tx.insertTx(buatTx({ tipe: "bonus", nominal, accountId, tanggal, label }));
    if (!sub) {
      await tx.insertTx(buatTx({ tipe: "bonus", nominal, wadahTujuan: "saldo", tanggal, indukId: gid }));
      return { id: gid };
    }
    if (saldo > 0) {
      await tx.insertTx(buatTx({ tipe: "bonus", nominal: saldo, wadahTujuan: "saldo", tanggal, indukId: gid }));
    }
    if (jajan > 0) {
      await tx.insertTx(buatTx({ tipe: "tambahan_jatah", nominal: jajan, subPostId: sub.id, tanggal, indukId: gid }));
    }
    return { id: gid };
  });
}

const NAMA_TIPE: Record<string, string> = {
  out: "pengeluaran",
  in: "pemasukan",
  gaji: "gaji",
  bonus: "bonus",
  tarik: "penarikan",
  pindah: "pemindahan",
};

export async function batalkanTransaksi(r: Repo, id: number): Promise<string> {
  return r.transaction(async (tx) => {
    const state = await tx.load();
    const t = state.txs.find((x) => x.id === Number(id));
    if (!t) throw new AksiError("Transaksi tidak ditemukan.");
    if (t.status !== "berlaku") throw new AksiError("Transaksi sudah dibatalkan.");
    if (TURUNAN.has(t.tipe)) throw new AksiError("Transaksi turunan dibatalkan bersama induknya.");
    await tx.updateTx(t.id, { status: "batal" });
    for (const anak of state.txs.filter((x) => x.indukId === t.id && x.status === "berlaku")) {
      await tx.updateTx(anak.id, { status: "batal" });
    }
    const sub = t.subPostId ? state.subPosts.find((s) => s.id === t.subPostId)?.nama : null;
    return `${NAMA_TIPE[t.tipe] ?? t.tipe} Rp${t.nominal.toLocaleString("id-ID")}${sub ? ` (${sub})` : ""} tgl ${t.tanggal} dibatalkan.`;
  });
}

export interface InputPos {
  groupId: number;
  nama: string;
  jatah: number;
}

export async function tambahPos(r: Repo, input: InputPos): Promise<{ id: number }> {
  return r.transaction(async (tx) => {
    const state = await tx.load();
    const nama = String(input.nama ?? "").trim().slice(0, 80);
    if (!nama) throw new AksiError("Nama pos wajib diisi.");
    if (state.subPosts.some((s) => norm(s.nama) === norm(nama)) || state.aliases.some((a) => a.alias === norm(nama))) {
      throw new AksiError("Nama atau alias itu sudah dipakai pos lain.");
    }
    if (!state.groups.some((g) => g.id === Number(input.groupId))) throw new AksiError("Grup tidak ditemukan.");
    const jatah = bulat(input.jatah, true);
    const id = await tx.addSubPost(Number(input.groupId), nama);
    await tx.addAlias(id, norm(nama));
    const items: PlanItem[] = aktivPlanItems(state);
    items.push({ tipe: "sub_pos", subPostId: id, nominal: jatah });
    await versiBaru(tx, state, items);
    return { id };
  });
}

function aktivPlanItems(state: State): PlanItem[] {
  return aktifPlan(state).items.map((i) => ({ ...i }));
}

export async function gantiNamaPos(r: Repo, id: number, namaBaru: string): Promise<void> {
  await r.transaction(async (tx) => {
    const state = await tx.load();
    const sub = state.subPosts.find((s) => s.id === Number(id));
    if (!sub) throw new AksiError("Pos tidak ditemukan.");
    const nama = String(namaBaru ?? "").trim().slice(0, 80);
    if (!nama) throw new AksiError("Nama pos wajib diisi.");
    if (
      state.subPosts.some((s) => s.id !== sub.id && norm(s.nama) === norm(nama)) ||
      state.aliases.some((a) => a.subPostId !== sub.id && a.alias === norm(nama))
    ) {
      throw new AksiError("Nama atau alias itu sudah dipakai pos lain.");
    }
    await tx.renameSubPost(sub.id, nama);
    await tx.addAlias(sub.id, norm(nama));
  });
}

export async function tambahAliasPos(r: Repo, id: number, alias: string): Promise<void> {
  await r.transaction(async (tx) => {
    const state = await tx.load();
    const sub = state.subPosts.find((s) => s.id === Number(id));
    if (!sub) throw new AksiError("Pos tidak ditemukan.");
    const a = norm(alias);
    if (!a) throw new AksiError("Alias tidak valid.");
    const ada = state.aliases.find((x) => x.alias === a);
    if (ada && ada.subPostId !== sub.id) throw new AksiError("Alias sudah dipakai pos lain.");
    await tx.addAlias(sub.id, a);
  });
}

export async function nonaktifkanPos(r: Repo, id: number): Promise<void> {
  await r.transaction(async (tx) => {
    const state = await tx.load();
    const sub = state.subPosts.find((s) => s.id === Number(id));
    if (!sub) throw new AksiError("Pos tidak ditemukan.");
    if (state.config.bonusSubPostId === sub.id) {
      throw new AksiError("Pos bonus tidak bisa dinonaktifkan. Ganti pos bonus lewat bot terlebih dahulu.");
    }
    await tx.deactivateSubPost(sub.id);
    const items = aktivPlanItems(state).filter((i) => !(i.tipe === "sub_pos" && i.subPostId === sub.id));
    await versiBaru(tx, state, items);
  });
}

export interface InputSetup {
  tanggalMulai: string;
  saldoAwal: number;
  tabunganAwal: number;
  investasiAwal: number;
}

export async function simpanSetup(r: Repo, hariIni: string, input: InputSetup): Promise<void> {
  await r.transaction(async (tx) => {
    const state = await tx.load();
    if (periodes(state).length) {
      throw new AksiError("Setup hanya bisa diulang sebelum gaji pertama dicatat.");
    }
    const tgl = tanggalSah(input.tanggalMulai, hariIni);
    const saldo = bulat(input.saldoAwal, true);
    const tabungan = bulat(input.tabunganAwal, true);
    const investasi = bulat(input.investasiAwal, true);
    await tx.setConfig("tanggal_mulai", tgl);
    await tx.setConfig("saldo_awal", String(saldo));
    await tx.setConfig("tabungan_awal", String(tabungan));
    await tx.setConfig("investasi_awal", String(investasi));
  });
}

export async function simpanGajiPokok(r: Repo, nominal: number): Promise<void> {
  const n = bulat(nominal, false);
  await r.transaction(async (tx) => {
    await tx.setConfig("gaji_pokok", String(n));
  });
}

export interface InputAkun {
  nama?: unknown;
  tipe?: unknown;
  saldoAwal?: unknown;
}

export async function tambahAkun(r: Repo, input: InputAkun): Promise<{ id: number }> {
  const nama = typeof input.nama === "string" ? input.nama.trim().slice(0, 80) : "";
  if (!nama) throw new AksiError("Nama dompet wajib diisi.");
  const tipe = (TIPE_AKUN as readonly string[]).includes(String(input.tipe)) ? (String(input.tipe) as AkunTipe) : "tunai";
  const saldoAwal = bulat(input.saldoAwal ?? 0, true);
  return r.transaction(async (tx) => {
    const state = await tx.load();
    if (state.accounts.some((a) => norm(a.nama) === norm(nama))) {
      throw new AksiError("Nama dompet sudah dipakai.");
    }
    const id = await tx.addAccount({ nama, tipe, saldoAwal });
    return { id };
  });
}

export interface InputPindahAkun {
  dariId?: unknown;
  keId?: unknown;
  nominal?: unknown;
  tanggal?: unknown;
  label?: unknown;
}

export async function pindahAkun(r: Repo, hariIni: string, input: InputPindahAkun): Promise<{ id: number }> {
  const nominal = bulat(input.nominal, false);
  const tanggal = tanggalSah(input.tanggal, hariIni);
  const label = typeof input.label === "string" ? input.label.trim().slice(0, 120) || null : null;
  return r.transaction(async (tx) => {
    const state = await tx.load();
    const dari = state.accounts.find((a) => a.id === Number(input.dariId) && a.aktif);
    const ke = state.accounts.find((a) => a.id === Number(input.keId) && a.aktif);
    if (!dari || !ke) throw new AksiError("Dompet asal atau tujuan tidak ditemukan.");
    if (dari.id === ke.id) throw new AksiError("Dompet asal dan tujuan harus berbeda.");
    const saldo = hitungAkun(state).daftar.find((a) => a.id === dari.id)?.saldo ?? 0;
    if (saldo < nominal) {
      throw new AksiError(`Saldo ${dari.nama} hanya Rp${saldo.toLocaleString("id-ID")}, kurang dari nominal.`);
    }
    const id = await tx.insertTx(
      buatTx({
        tipe: "pindah",
        nominal,
        wadahAsal: "saldo",
        wadahTujuan: "saldo",
        accountId: dari.id,
        accountIdTujuan: ke.id,
        tanggal,
        label,
      }),
    );
    return { id };
  });
}

export interface InputDebt {
  jenis: DebtJenis | string;
  nama: string;
  nominal: number;
  tanggal: string;
  jatuhTempo?: string | null;
  catatan?: string | null;
}

export async function tambahDebt(r: Repo, hariIni: string, input: InputDebt): Promise<{ id: number }> {
  return r.transaction(async (tx) => {
    const jenis = jenisDebtSah(input.jenis);
    const nama = String(input.nama ?? "").trim().slice(0, 80);
    if (!nama) throw new AksiError("Nama wajib diisi.");
    const nominal = bulat(input.nominal, false);
    const tanggal = tanggalSah(input.tanggal, hariIni);
    const jatuhTempo = input.jatuhTempo ? tanggalKalender(input.jatuhTempo) : null;
    const catatan = typeof input.catatan === "string" ? input.catatan.trim().slice(0, 200) || null : null;
    const id = await tx.addDebt({
      jenis,
      nama,
      nominal,
      dibayar: 0,
      tanggal,
      jatuhTempo,
      catatan,
    });
    return { id };
  });
}

export async function bayarDebt(
  r: Repo,
  id: number,
  nominal?: number | null,
): Promise<{ sisa: number; lunas: boolean }> {
  return r.transaction(async (tx) => {
    const state = await tx.load();
    const d = state.debts.find((x) => x.id === Number(id));
    if (!d) throw new AksiError("Catatan piutang/utang tidak ditemukan.");
    if (d.status !== "aktif") throw new AksiError("Catatan ini sudah tidak aktif.");
    const sisa = d.nominal - d.dibayar;
    const bayar = nominal === undefined || nominal === null ? sisa : bulat(nominal, false);
    if (bayar > sisa) throw new AksiError(`Nominal melebihi sisa ${sisa.toLocaleString("id-ID")}.`);
    const dibayar = d.dibayar + bayar;
    const lunas = dibayar >= d.nominal;
    await tx.updateDebt(d.id, { dibayar, status: lunas ? "lunas" : "aktif" });
    return { sisa: d.nominal - dibayar, lunas };
  });
}

export async function batalkanDebt(r: Repo, id: number): Promise<void> {
  await r.transaction(async (tx) => {
    const state = await tx.load();
    const d = state.debts.find((x) => x.id === Number(id));
    if (!d) throw new AksiError("Catatan piutang/utang tidak ditemukan.");
    await tx.updateDebt(d.id, { status: "batal" });
  });
}

export interface InputGoal {
  nama: string;
  targetNominal: number;
  tanggal: string;
  targetTanggal?: string | null;
  catatan?: string | null;
}

export async function tambahGoal(r: Repo, hariIni: string, input: InputGoal): Promise<{ id: number }> {
  return r.transaction(async (tx) => {
    const nama = String(input.nama ?? "").trim().slice(0, 80);
    if (!nama) throw new AksiError("Nama target wajib diisi.");
    const targetNominal = bulat(input.targetNominal, false);
    const tanggal = tanggalSah(input.tanggal, hariIni);
    const targetTanggal = input.targetTanggal ? tanggalKalender(input.targetTanggal) : null;
    const catatan = typeof input.catatan === "string" ? input.catatan.trim().slice(0, 200) || null : null;
    const id = await tx.addGoal({ nama, targetNominal, terkumpul: 0, tanggal, targetTanggal, catatan });
    return { id };
  });
}

export async function nabungGoal(
  r: Repo,
  id: number,
  nominal: number,
): Promise<{ terkumpul: number; selesai: boolean }> {
  return r.transaction(async (tx) => {
    const state = await tx.load();
    const g = state.goals.find((x) => x.id === Number(id));
    if (!g) throw new AksiError("Target tabungan tidak ditemukan.");
    if (g.status !== "aktif") throw new AksiError("Target ini sudah tidak aktif.");
    const tambah = bulat(nominal, false);
    const terkumpul = g.terkumpul + tambah;
    const selesai = terkumpul >= g.targetNominal;
    await tx.updateGoal(g.id, { terkumpul, status: selesai ? "selesai" : "aktif" });
    return { terkumpul, selesai };
  });
}

export async function batalkanGoal(r: Repo, id: number): Promise<void> {
  await r.transaction(async (tx) => {
    const state = await tx.load();
    const g = state.goals.find((x) => x.id === Number(id));
    if (!g) throw new AksiError("Target tabungan tidak ditemukan.");
    await tx.updateGoal(g.id, { status: "batal" });
  });
}
