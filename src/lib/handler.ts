/**
 * Pemroses pesan: satu pesan masuk -> satu balasan teks.
 * Seluruh pemrosesan berjalan di dalam satu transaksi database dengan kunci per pemilik
 * (FR-80, FR-81). Kalau gagal, transaksi di-rollback dan kiriman ulang dari Meta diproses ulang.
 */
import { createHash, randomBytes } from "node:crypto";
import { validasiAi, type AiClient } from "./ai";
import {
  aktifPlan,
  bagiBonus,
  evaluasi,
  hitungPeriode,
  hitungWadah,
  indeksPeriode,
  itemUsulan,
  nominalItem,
  periodes,
  planById,
  totalPlan,
} from "./engine";
import { rp, tglPendek } from "./format";
import { parseCommand, type Cmd } from "./parse/command";
import { diffDays, wibDate } from "./parse/date";
import { cariDalamTeks, cariPersis, daftarPilihan, norm, type Kecocokan } from "./parse/pos";
import type { Repo } from "./repo";
import {
  TEKS_BANTUAN,
  barisGrup,
  selisihBertanda,
  teksLaporan,
  teksLaporanPeriode,
  teksRencanaVsKenyataan,
  teksUsulan,
  teksWadah,
} from "./report";
import { maskNomor } from "./whatsapp";
import { TURUNAN, buatTx, type PlanItem, type State, type Tx, type Wadah } from "./types";

export interface Deps {
  ai: AiClient | null;
  /** jam sistem (epoch ms); dapat disuntik saat pengujian */
  now?: () => number;
  /** URL publik untuk tautan ekspor */
  baseUrl?: string;
  /** log operasional (tanpa isi pesan, nomor harus sudah dimaskir) */
  log?: (pesan: string) => void;
}

export interface Masuk {
  id: string;
  from: string;
  type: string;
  text?: string;
  timestampMs: number;
}

export const TEKS_NON_TEKS =
  'Maaf, saya hanya bisa membaca pesan teks, bukan foto, suara, atau stiker. Contoh: "out 25rb kopi", "gaji masuk 1.8 juta", "saldo". Ketik "bantuan" untuk daftar lengkap.';
const TEKS_TIDAK_DIKENAL = 'Perintah tidak dikenali. Ketik "bantuan" untuk daftar perintah.';
const TEKS_FALLBACK_KAKU =
  'Pesan itu belum bisa dibaca otomatis. Pakai format: "out 25rb kopi" atau "in 150rb freelance". Ketik "bantuan" untuk daftar perintah.';

const MENIT = 60_000;
const KONFIRMASI_MS = 10 * MENIT; // FR-82
const PETAKAN_MS = 24 * 60 * MENIT;
const EKSPOR_MS = 15 * MENIT; // NFR-10

/** Titik masuk. null = tidak ada balasan (nomor asing atau pesan duplikat). */
export async function tanganiPesan(repo: Repo, deps: Deps, msg: Masuk): Promise<string | null> {
  if (!(await repo.isAllowed(msg.from))) {
    deps.log?.(`Pesan dari nomor di luar whitelist diabaikan: ${maskNomor(msg.from)}`);
    return null; // FR-01: diabaikan tanpa balasan
  }
  return repo.transaction(async (r) => {
    if (!(await r.tryRecordInbound(msg.id))) return null; // FR-80
    const balasan = msg.type === "text" ? await new Sesi(r, deps, msg).jalankan() : TEKS_NON_TEKS;
    await r.setInboundResult(msg.id, balasan.slice(0, 120));
    return balasan;
  });
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const judul = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

/** Catatan terakhir yang bisa dikoreksi/dihapus: bukan turunan, bukan anak dari catatan lain. */
export function catatanTerakhir(state: State): Tx | null {
  const k = state.txs.filter((t) => t.status === "berlaku" && t.indukId === null && !TURUNAN.has(t.tipe));
  return k.length ? k.reduce((a, b) => (b.id > a.id ? b : a)) : null;
}

class Sesi {
  state!: State;
  readonly today: string;
  readonly nowMs: number;
  private catatan: string[] = [];

  constructor(readonly r: Repo, readonly deps: Deps, readonly msg: Masuk) {
    this.today = wibDate(msg.timestampMs);
    this.nowMs = deps.now?.() ?? Date.now();
  }

  async muat() {
    this.state = await this.r.load();
  }

  async jalankan(): Promise<string> {
    await this.muat();
    const teks = this.msg.text ?? "";
    const cmd = parseCommand(teks, this.today);

    // FR-03: tanpa setup, pakai tanggal pesan pertama dan nilai Rp0
    if (!this.state.config.tanggalMulai && cmd.k !== "setup" && cmd.k !== "bantuan" && cmd.k !== "error") {
      await this.r.setConfig("tanggal_mulai", this.today);
      await this.muat();
      this.catatan.push(
        `Setup otomatis: mulai ${tglPendek(this.today)}, Saldo, Tabungan, dan Investasi awal Rp0. Ubah dengan "setup 17/10 saldo 300rb tabungan 0 investasi 0" selama gaji pertama belum dicatat.`,
      );
    }
    const balasan = await this.eksekusi(cmd, teks);
    return [balasan, ...this.catatan].join("\n\n");
  }

  private async eksekusi(cmd: Cmd, teks: string): Promise<string> {
    switch (cmd.k) {
      case "bantuan": return TEKS_BANTUAN;
      case "error": return cmd.pesan;
      case "setup": return this.setup(cmd);
      case "out":
        return this.catatOut({
          nominal: cmd.nominal,
          biayaAdmin: cmd.biayaAdmin,
          uraian: cmd.uraian,
          tanggal: cmd.tanggal ?? this.today,
          sumber: "kaku",
        });
      case "in":
        return this.catatIn(cmd.nominal, cmd.label, cmd.wadah, cmd.tanggal ?? this.today, "kaku");
      case "gaji": return this.gaji(cmd.nominal, cmd.tanggal ?? this.today, false);
      case "bonus": return this.bonus(cmd.nominal, cmd.wadah, "kaku");
      case "koreksi": return this.koreksi(cmd);
      case "hapus_terakhir": return this.hapusTerakhir();
      case "ya": case "batal": return this.konfirmasi(cmd.k);
      case "setuju": case "tolak": return this.usulan(cmd.k);
      case "set": return this.setRencana(cmd.pos, cmd.nominal, cmd.sekarang);
      case "geser": return this.geser(cmd.nominal, cmd.dari, cmd.ke);
      case "pos": return this.kelolaPos(cmd);
      case "tarik": return this.pindah(cmd.nominal, cmd.wadah, "saldo", "tarik");
      case "pindah": return this.pindah(cmd.nominal, cmd.dari, cmd.ke, "pindah");
      case "saldo": return teksWadah(hitungWadah(this.state));
      case "sisa": return this.sisa(cmd.pos);
      case "debt_add": return this.debtTambah(cmd.jenis, cmd.nominal, cmd.nama, cmd.jatuhTempo);
      case "debt_list": return this.debtDaftar(cmd.jenis);
      case "debt_pay": return this.debtBayar(cmd.jenis, cmd.nama, cmd.nominal);
      case "laporan": return teksLaporan(this.state, this.today);
      case "laporan_periode": return teksLaporanPeriode(this.state);
      case "evaluasi": return this.evaluasiManual();
      case "ekspor": return this.ekspor();
      case "bebas": return this.bebas(teks);
    }
  }

  // ---------- setup ----------

  private async setup(c: Extract<Cmd, { k: "setup" }>): Promise<string> {
    if (periodes(this.state).length > 0) {
      return "Setup hanya bisa diulang sebelum gaji pertama dicatat, karena hitungan periode sudah berjalan. Hapus gaji pertama dulu (hapus terakhir) bila perlu.";
    }
    const tgl = c.tanggal ?? this.today;
    await this.r.setConfig("tanggal_mulai", tgl);
    await this.r.setConfig("saldo_awal", String(c.saldo));
    await this.r.setConfig("tabungan_awal", String(c.tabungan));
    await this.r.setConfig("investasi_awal", String(c.investasi));
    return `Setup tersimpan: mulai ${tglPendek(tgl)}, Saldo ${rp(c.saldo)}, Tabungan ${rp(c.tabungan)}, Investasi ${rp(c.investasi)}.`;
  }

  // ---------- pengeluaran ----------

  private async catatOut(p: {
    nominal: number;
    biayaAdmin?: number;
    uraian: string;
    tanggal: string;
    sumber: "kaku" | "ai";
    subPostId?: number | null;
  }): Promise<string> {
    const sebelum = this.state;
    let kec: Kecocokan;
    let sub: number | null = null;
    if (p.subPostId !== undefined) {
      sub = p.subPostId;
      kec = sub ? { kind: "satu", id: sub } : { kind: "none" };
    } else {
      kec = cariDalamTeks(this.state, p.uraian);
      if (kec.kind === "satu") sub = kec.id;
    }
    const id = await this.r.insertTx(
      buatTx({
        tipe: "out",
        nominal: p.nominal,
        biayaAdmin: p.biayaAdmin ?? 0,
        subPostId: sub,
        tanggal: p.tanggal,
        label: p.uraian || null,
        sumber: p.sumber,
        waMessageId: this.msg.id,
      }),
    );
    if (sub === null) await this.r.addPending("petakan", { txId: id }, this.nowMs + PETAKAN_MS);
    await this.muat();
    return this.balasOut(sebelum, id, kec);
  }

  private balasOut(sebelum: State, txId: number, kec: Kecocokan): string {
    const state = this.state;
    const t = state.txs.find((x) => x.id === txId)!;
    const sub = t.subPostId ? state.subPosts.find((s) => s.id === t.subPostId)! : null;
    const ps = periodes(state);
    const cur = ps.length;
    const idx = indeksPeriode(ps, t.tanggal);
    const w = hitungWadah(state);
    const ai = t.sumber === "ai";

    const total = t.nominal + (t.biayaAdmin ?? 0);
    const admin = t.biayaAdmin > 0 ? ` + admin ${rp(t.biayaAdmin)} (total ${rp(total)})` : "";
    let kepala = `Tercatat${ai ? " (dibaca AI)" : ""}: ${rp(t.nominal)}${admin}, ${sub ? sub.nama : "belum dipetakan"}`;
    if (t.tanggal !== this.today) kepala += ` (tgl ${tglPendek(t.tanggal)})`;
    kepala += ".";

    const baris: string[] = [];
    if (idx === 0) {
      baris.push(`${kepala} Periode awal (belum ada jatah).`);
      if (cur >= 1) baris.push(`Peringatan: tanggal ini jatuh sebelum gaji pertama, jadi langsung mengurangi Saldo.`);
      baris.push(`Saldo sekarang: ${rp(w.saldo)}.`);
    } else if (idx === cur) {
      baris.push(kepala);
      const h = hitungPeriode(state, ps, ps[cur - 1]);
      const psSeb = periodes(sebelum);
      const hSeb = psSeb[cur - 1] ? hitungPeriode(sebelum, psSeb, psSeb[cur - 1]) : null;
      const tambahanSaldo = h.kekuranganDD - (hSeb?.kekuranganDD ?? 0);
      if (tambahanSaldo > 0) {
        baris.push(`Dana Darurat habis. ${rp(tambahanSaldo)} diambil dari Saldo. Saldo sekarang: ${rp(w.saldo)}.`);
      } else if (sub) {
        const st = h.pos.find((x) => x.subPostId === sub.id)!;
        baris.push(
          st.lewat > 0
            ? `${sub.nama} lewat ${rp(st.lewat)}, ditutup Dana Darurat. Sisa Dana Darurat: ${rp(h.ddSisa)}.`
            : `Sisa jatah ${sub.nama}: ${rp(st.sisa)} dari ${rp(st.efektif)}.`,
        );
      } else {
        baris.push(`Belum dipetakan, sementara dihitung ke Dana Darurat. Sisa Dana Darurat: ${rp(h.ddSisa)}.`);
      }
      if (w.saldo < 0) baris.push(`Peringatan: Saldo sekarang ${rp(w.saldo)}, di bawah nol.`);
    } else {
      baris.push(kepala);
      baris.push(
        `Peringatan: tanggal ini masuk periode ke-${idx} (mulai ${tglPendek(ps[idx - 1].start)}) yang sudah ditutup. Hasil periode itu dihitung ulang.`,
      );
      baris.push(`Saldo sekarang: ${rp(w.saldo)}.`);
    }

    if (ai) baris.push('Salah? Ketik "hapus terakhir".');
    if (!sub) {
      const pilihan = daftarPilihan(state);
      if (kec.kind === "banyak") {
        const nama = kec.ids.map((id) => state.subPosts.find((s) => s.id === id)!.nama).join(", ");
        baris.push(`Pesan cocok dengan lebih dari satu pos (${nama}). ${rp(total)} untuk apa? Balas nama pos: ${pilihan}.`);
      } else {
        baris.push(`${rp(total)} untuk apa? Balas nama pos: ${pilihan}.`);
      }
      baris.push('Atau balas "tanpa pos" untuk membiarkannya. Untuk pos baru: pos tambah operasional <nama> 0.');
    }
    return baris.join("\n");
  }

  // ---------- pemasukan ----------

  private async catatIn(nominal: number, label: string, wadah: Wadah, tanggal: string, sumber: "kaku" | "ai"): Promise<string> {
    await this.r.insertTx(
      buatTx({ tipe: "in", nominal, wadahTujuan: wadah, tanggal, label: label || null, sumber, waMessageId: this.msg.id }),
    );
    await this.muat();
    const w = hitungWadah(this.state);
    const baris = [
      `Pemasukan tercatat${sumber === "ai" ? " (dibaca AI)" : ""}: ${rp(nominal)}${label ? `, ${label}` : ""}, ke ${wadah}.`,
      `${judul(wadah)} sekarang: ${rp(w[wadah])}.`,
    ];
    if (sumber === "ai") baris.push('Salah? Ketik "hapus terakhir".');
    return baris.join("\n");
  }

  // ---------- gaji ----------

  private async gaji(nominal: number, tanggal: string, lewatiCek: boolean): Promise<string> {
    if (tanggal > this.today) return "Tanggal gaji di masa depan ditolak.";
    const ps = periodes(this.state);

    if (!lewatiCek && ps.length >= 1) {
      const terakhir = ps[ps.length - 1].start;
      const jarak = diffDays(tanggal, terakhir);
      if (jarak < this.state.config.ambangGajiGanda) {
        await this.r.addPending("gaji_ganda", { nominal, tanggal }, this.nowMs + KONFIRMASI_MS);
        const ket =
          jarak < 0
            ? `tanggalnya lebih awal dari gaji terakhir (${tglPendek(terakhir)})`
            : `baru ${jarak} hari setelah gaji terakhir (${tglPendek(terakhir)}), batas wajar ${this.state.config.ambangGajiGanda} hari`;
        return `Gaji ${rp(nominal)} tgl ${tglPendek(tanggal)}: ${ket}. Data belum diubah. Balas "ya" untuk tetap mencatat dan menutup periode, atau "batal".`;
      }
    }

    const plan = aktifPlan(this.state);
    const R = totalPlan(plan);
    const tab = nominalItem(plan, "tabungan");
    const inv = nominalItem(plan, "investasi");

    const gid = await this.r.insertTx(
      buatTx({ tipe: "gaji", nominal, tanggal, planVersionId: plan.id, waMessageId: this.msg.id }),
    );
    if (tab > 0) await this.r.insertTx(buatTx({ tipe: "alokasi_gaji", nominal: tab, wadahTujuan: "tabungan", tanggal, indukId: gid }));
    if (inv > 0) await this.r.insertTx(buatTx({ tipe: "alokasi_gaji", nominal: inv, wadahTujuan: "investasi", tanggal, indukId: gid }));
    if (nominal !== R) {
      const d = nominal - R;
      await this.r.insertTx(
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
    await this.muat();

    const state = this.state;
    const ps2 = periodes(state);
    const idxBaru = ps2.findIndex((p) => p.gaji.id === gid) + 1;
    const tertutup = idxBaru >= 2 ? hitungPeriode(state, ps2, ps2[idxBaru - 2]) : null;
    const w = hitungWadah(state);

    const baris: string[] = [`Gaji ${rp(nominal)} dicatat (tgl ${tglPendek(tanggal)}).`];
    if (tertutup) baris.push(`Periode lama ditutup. Sisa masuk Saldo: ${rp(tertutup.sisaTotal)}.`);
    else baris.push("Periode awal ditutup (tanpa sisa jatah).");
    baris.push(`Tabungan +${rp(tab)} (total ${rp(w.tabungan)}). Investasi +${rp(inv)} (total ${rp(w.investasi)}).`);
    if (nominal !== R) {
      baris.push(
        `Peringatan: gaji ${rp(nominal)} berbeda dari rencana ${rp(R)} (selisih ${selisihBertanda(nominal - R)}). Selisih ${nominal > R ? "masuk ke" : "diambil dari"} Saldo. Rencana tidak diubah otomatis; sesuaikan dengan "set" bila perlu.`,
      );
    }
    const jatahGrup = state.groups
      .map((g) => {
        const j = plan.items
          .filter((i) => i.tipe === "sub_pos" && state.subPosts.find((s) => s.id === i.subPostId)?.groupId === g.id)
          .reduce((s, i) => s + i.nominal, 0);
        return j > 0 ? `${g.nama} ${rp(j)}` : null;
      })
      .filter(Boolean);
    baris.push(`Jatah periode baru: ${jatahGrup.join(", ")}, Dana Darurat ${rp(nominalItem(plan, "dd"))}.`);
    baris.push(`Saldo sekarang: ${rp(w.saldo)}.`);

    if (tertutup) {
      baris.push("", `Ringkasan periode ke-${tertutup.periode.index}:`, ...barisGrup(state, tertutup));
      baris.push("", ...teksRencanaVsKenyataan(tertutup));
      const usulan = await this.buatUsulan();
      if (usulan.length) baris.push("", ...usulan);
    }
    if (idxBaru < ps2.length) baris.push("", "Catatan: gaji ini diberi tanggal lebih awal dari gaji yang sudah ada, jadi batas periode berubah.");
    return baris.join("\n");
  }

  /** Membuat versi rencana 'usulan' dari evaluasi; usulan lama dibuang. */
  private async buatUsulan(): Promise<string[]> {
    const ev = evaluasi(this.state);
    if (ev.tanpaData) return ["Usulan angka belum dibuat: belum ada pengeluaran tercatat di periode yang ditutup."];
    if (!ev.usulan) return [];
    for (const p of this.state.plans.filter((x) => x.status === "usulan")) await this.r.setPlanStatus(p.id, "arsip");
    if (!ev.usulan.some((u) => u.baru !== u.lama)) {
      return ["Usulan: tidak ada perubahan, jatah sekarang sudah sesuai rata-rata pemakaian."];
    }
    const n = this.state.plans.filter((p) => p.nama.startsWith("Usulan")).length + 1;
    await this.r.createPlanVersion(`Usulan ${n}`, "usulan", itemUsulan(aktifPlan(this.state), ev.usulan));
    return teksUsulan(ev);
  }

  private async evaluasiManual(): Promise<string> {
    const ev = evaluasi(this.state);
    if (!ev.acuan) return "Belum ada data periode. Evaluasi tersedia setelah gaji pertama dicatat.";
    const baris: string[] = [];
    if (ev.periodeDipakai === 0) {
      baris.push(...teksRencanaVsKenyataan(ev.acuan));
      baris.push("Belum ada periode yang tertutup, jadi belum ada usulan angka. Usulan dibuat setelah gaji berikutnya dicatat.");
      return baris.join("\n");
    }
    baris.push(...teksRencanaVsKenyataan(ev.acuan), "");
    const usulan = await this.buatUsulan();
    baris.push(...usulan);
    return baris.join("\n");
  }

  private async usulan(aksi: "setuju" | "tolak"): Promise<string> {
    const u = [...this.state.plans].reverse().find((p) => p.status === "usulan");
    if (!u) return 'Tidak ada usulan yang menunggu. Ketik "evaluasi" untuk membuatnya.';
    if (aksi === "tolak") {
      await this.r.setPlanStatus(u.id, "arsip");
      return "Usulan dibuang. Rencana tidak berubah.";
    }
    await this.r.setPlanStatus(aktifPlan(this.state).id, "arsip");
    await this.r.setPlanStatus(u.id, "aktif");
    const R = totalPlan(u);
    return `Usulan dipakai mulai periode berikutnya. ${this.ketTotalRencana(R)}`;
  }

  // ---------- bonus ----------

  private async bonus(nominal: number, wadah: Wadah | null, sumber: "kaku" | "ai"): Promise<string> {
    const state = this.state;
    const ps = periodes(state);
    const berjalan = ps.length > 0 && ps[ps.length - 1].start <= this.today;
    const labelAi = sumber === "ai" ? " (dibaca AI)" : "";
    const akhir = sumber === "ai" ? '\nSalah? Ketik "hapus terakhir".' : "";

    if (wadah || !berjalan) {
      const tujuan = wadah ?? "saldo";
      await this.r.insertTx(
        buatTx({ tipe: "bonus", nominal, wadahTujuan: tujuan, tanggal: this.today, sumber, waMessageId: this.msg.id }),
      );
      await this.muat();
      const ket = !wadah ? " (periode awal: belum ada jatah Jajan, seluruhnya ke Saldo)" : "";
      return `Bonus${labelAi} ${rp(nominal)} masuk ke ${tujuan}${ket}. ${judul(tujuan)} sekarang: ${rp(hitungWadah(this.state)[tujuan])}.${akhir}`;
    }

    const { jajan, saldo } = bagiBonus(nominal, state.config.persenJajan);
    const subId = state.config.bonusSubPostId;
    const sub = state.subPosts.find((s) => s.id === subId && s.aktif);
    const gid = await this.r.insertTx(
      buatTx({ tipe: "bonus", nominal, tanggal: this.today, sumber, waMessageId: this.msg.id }),
    );
    if (!sub) {
      await this.r.insertTx(buatTx({ tipe: "bonus", nominal, wadahTujuan: "saldo", tanggal: this.today, indukId: gid }));
      await this.muat();
      return `Bonus${labelAi} ${rp(nominal)} masuk ke Saldo (pos Jajan tidak aktif, jadi tidak dibagi).${akhir}`;
    }
    if (saldo > 0) await this.r.insertTx(buatTx({ tipe: "bonus", nominal: saldo, wadahTujuan: "saldo", tanggal: this.today, indukId: gid }));
    if (jajan > 0) await this.r.insertTx(buatTx({ tipe: "tambahan_jatah", nominal: jajan, subPostId: sub.id, tanggal: this.today, indukId: gid }));
    await this.muat();
    const ps2 = periodes(this.state);
    const h = hitungPeriode(this.state, ps2, ps2[ps2.length - 1]);
    const st = h.pos.find((x) => x.subPostId === sub.id);
    return `Bonus${labelAi} ${rp(nominal)} dibagi: Saldo +${rp(saldo)}, jatah ${sub.nama} periode ini +${rp(jajan)}. Sisa jatah ${sub.nama}: ${rp(st?.sisa ?? 0)}. Saldo sekarang: ${rp(hitungWadah(this.state).saldo)}.${akhir}`;
  }

  // ---------- koreksi / hapus ----------

  private deskripsi(t: Tx): string {
    const sub = t.subPostId ? this.state.subPosts.find((s) => s.id === t.subPostId)?.nama : null;
    const jenis: Record<string, string> = { out: "pengeluaran", in: "pemasukan", gaji: "gaji", bonus: "bonus", tarik: "penarikan", pindah: "pemindahan", geser: "geser jatah" };
    const admin = t.biayaAdmin > 0 ? ` + admin ${rp(t.biayaAdmin)}` : "";
    return `${jenis[t.tipe] ?? t.tipe} ${rp(t.nominal)}${admin}${sub ? ` (${sub})` : ""} tgl ${tglPendek(t.tanggal)}`;
  }

  private async batalkan(id: number) {
    await this.r.updateTx(id, { status: "batal" });
    for (const t of this.state.txs.filter((x) => x.indukId === id && x.status === "berlaku")) {
      await this.r.updateTx(t.id, { status: "batal" });
    }
  }

  private async hapusTerakhir(): Promise<string> {
    const t = catatanTerakhir(this.state);
    if (!t) return "Belum ada catatan yang bisa dihapus.";
    if (t.tipe === "gaji") {
      await this.r.addPending("hapus_gaji", { txId: t.id }, this.nowMs + KONFIRMASI_MS);
      return `Menghapus ${this.deskripsi(t)} juga membatalkan alokasi Tabungan, Investasi, dan selisihnya, lalu membuka kembali periode sebelumnya. Balas "ya" untuk melanjutkan atau "batal".`;
    }
    await this.batalkan(t.id);
    await this.muat();
    return `Dibatalkan: ${this.deskripsi(t)}. Saldo sekarang: ${rp(hitungWadah(this.state).saldo)}.`;
  }

  private async koreksi(c: Extract<Cmd, { k: "koreksi" }>): Promise<string> {
    const lama = catatanTerakhir(this.state);
    if (!lama) return "Belum ada catatan yang bisa dikoreksi.";
    if (lama.tipe !== "out" && lama.tipe !== "in") {
      return `Koreksi hanya untuk catatan out dan in. Untuk ${this.deskripsi(lama)}, ketik "hapus terakhir" lalu catat ulang.`;
    }
    const baru = { ...lama };
    if (c.field === "nominal") baru.nominal = c.nominal;
    else if (c.field === "tanggal") {
      if (c.tanggal > this.today) return "Tanggal di masa depan ditolak.";
      baru.tanggal = c.tanggal;
    } else {
      if (lama.tipe !== "out") return "Koreksi pos hanya untuk pengeluaran.";
      const id = cariPersis(this.state, c.pos) ?? (() => { const k = cariDalamTeks(this.state, c.pos); return k.kind === "satu" ? k.id : null; })();
      if (!id) return `Pos "${c.pos}" tidak dikenali. Pilihan: ${daftarPilihan(this.state)}.`;
      baru.subPostId = id;
    }
    const sebelum = this.state;
    await this.r.updateTx(lama.id, { status: "batal" });
    const { id: _id, status: _s, ...sisa } = baru;
    const idBaru = await this.r.insertTx({ ...sisa, penggantiDari: lama.id, waMessageId: this.msg.id });
    const p = await this.r.getPending(["petakan"]);
    if (p && p.payload.txId === lama.id) await this.r.resolvePending(p.id, "selesai");
    if (baru.tipe === "out" && baru.subPostId === null) await this.r.addPending("petakan", { txId: idBaru }, this.nowMs + PETAKAN_MS);
    await this.muat();
    const kepala = "Koreksi tersimpan: catatan lama dibatalkan, catatan baru dibuat.";
    if (baru.tipe === "out") return `${kepala}\n${this.balasOut(sebelum, idBaru, { kind: "none" })}`;
    return `${kepala}\nPemasukan ${rp(baru.nominal)} tgl ${tglPendek(baru.tanggal)}. Saldo sekarang: ${rp(hitungWadah(this.state).saldo)}.`;
  }

  private async konfirmasi(jawab: "ya" | "batal"): Promise<string> {
    const p = await this.r.getPending(["gaji_ganda", "hapus_gaji"]);
    if (!p) return "Tidak ada aksi yang menunggu konfirmasi.";
    if (p.kedaluwarsaPada < this.nowMs) {
      await this.r.resolvePending(p.id, "kedaluwarsa");
      return "Aksi itu sudah kedaluwarsa (lebih dari 10 menit). Ketik ulang perintahnya.";
    }
    if (jawab === "batal") {
      await this.r.resolvePending(p.id, "batal");
      return "Dibatalkan. Data tidak berubah.";
    }
    await this.r.resolvePending(p.id, "selesai");
    if (p.jenis === "gaji_ganda") {
      return this.gaji(Number(p.payload.nominal), String(p.payload.tanggal), true);
    }
    const t = this.state.txs.find((x) => x.id === Number(p.payload.txId));
    if (!t || t.status !== "berlaku") return "Gaji itu sudah tidak berlaku.";
    await this.batalkan(t.id);
    await this.muat();
    const ps = periodes(this.state);
    return `Gaji ${rp(t.nominal)} tgl ${tglPendek(t.tanggal)} dibatalkan beserta alokasinya. ${
      ps.length ? `Periode ke-${ps.length} terbuka kembali.` : "Kembali ke periode awal."
    } Saldo sekarang: ${rp(hitungWadah(this.state).saldo)}.`;
  }

  // ---------- rencana ----------

  private ketTotalRencana(R: number): string {
    const pokok = this.state.config.gajiPokok;
    return R === pokok
      ? `Total rencana ${rp(R)}, sesuai gaji pokok.`
      : `Total rencana ${rp(R)}, selisih ${selisihBertanda(R - pokok)} dari gaji pokok ${rp(pokok)} (hanya peringatan, tidak ditolak).`;
  }

  private resolveSub(teks: string): number | null {
    const id = cariPersis(this.state, teks);
    if (id) return id;
    const k = cariDalamTeks(this.state, teks);
    return k.kind === "satu" ? k.id : null;
  }

  private async versiBaru(items: PlanItem[]): Promise<number> {
    await this.r.setPlanStatus(aktifPlan(this.state).id, "arsip");
    return this.r.createPlanVersion(`Rencana ${this.state.plans.length + 1}`, "aktif", items);
  }

  private async setRencana(pos: string, nominal: number, sekarang: boolean): Promise<string> {
    const n = norm(pos);
    let tipe: PlanItem["tipe"];
    let subId: number | null = null;
    let label: string;
    if (n === "dd" || n === "dana darurat") { tipe = "dd"; label = "Dana Darurat"; }
    else if (n === "tabungan") { tipe = "tabungan"; label = "Tabungan"; }
    else if (n === "investasi") { tipe = "investasi"; label = "Investasi"; }
    else {
      subId = this.resolveSub(pos);
      if (!subId) return `Pos "${pos}" tidak dikenali. Pilihan: ${daftarPilihan(this.state)}, dd, tabungan, investasi.`;
      tipe = "sub_pos";
      label = this.state.subPosts.find((s) => s.id === subId)!.nama;
    }
    if (sekarang && (tipe === "tabungan" || tipe === "investasi")) {
      return `Tabungan dan Investasi hanya bisa berubah mulai periode berikutnya karena sudah dipotong saat gaji masuk. Untuk menambah sekarang, pakai: pindah 100rb dari saldo ke ${tipe}.`;
    }

    const aktif = aktifPlan(this.state);
    const lama = nominalItem(aktif, tipe, subId);
    const items = aktif.items.map((i) => ({ ...i }));
    const it = items.find((i) => i.tipe === tipe && i.subPostId === subId);
    if (it) it.nominal = nominal;
    else items.push({ tipe, subPostId: subId, nominal });

    const idBaru = await this.versiBaru(items); // FR-54: versi baru, versi lama tersimpan
    let ket = "Berlaku mulai periode berikutnya.";
    const ps = periodes(this.state);
    if (sekarang) {
      if (!ps.length) ket = "Belum ada periode berjalan; berlaku sejak gaji pertama.";
      else {
        const cur = ps[ps.length - 1];
        const planCur = planById(this.state, cur.planId);
        const jatahTotal = (pl: { items: PlanItem[] }) => pl.items.filter((i) => i.tipe === "sub_pos" || i.tipe === "dd").reduce((s, i) => s + i.nominal, 0);
        const delta = jatahTotal({ items }) - jatahTotal(planCur);
        await this.r.setGajiPlan(cur.gaji.id, idBaru);
        if (delta !== 0) {
          await this.r.insertTx(
            buatTx({
              tipe: "selisih_gaji",
              nominal: Math.abs(delta),
              wadahAsal: delta > 0 ? "saldo" : null,
              wadahTujuan: delta < 0 ? "saldo" : null,
              tanggal: this.today,
              indukId: cur.gaji.id,
            }),
          );
        }
        ket = `Berlaku juga di periode berjalan${delta ? `; selisih ${selisihBertanda(delta)} jatah ${delta > 0 ? "diambil dari" : "dikembalikan ke"} Saldo` : ""}.`;
      }
    }
    return `${label}: ${rp(lama)} jadi ${rp(nominal)}. ${ket} ${this.ketTotalRencana(totalPlan({ ...aktif, items }))}`;
  }

  private async geser(nominal: number, dari: string, ke: string): Promise<string> {
    const ps = periodes(this.state);
    if (!ps.length) return "Geser jatah baru bisa dipakai setelah gaji pertama dicatat (periode awal belum punya jatah).";
    const a = this.resolveSub(dari);
    const b = this.resolveSub(ke);
    if (!a) return `Pos asal "${dari}" tidak dikenali. Pilihan: ${daftarPilihan(this.state)}.`;
    if (!b) return `Pos tujuan "${ke}" tidak dikenali. Pilihan: ${daftarPilihan(this.state)}.`;
    if (a === b) return "Pos asal dan tujuan harus berbeda.";
    const h = hitungPeriode(this.state, ps, ps[ps.length - 1]);
    const sa = h.pos.find((x) => x.subPostId === a);
    if (!sa || sa.sisa < nominal) return `Sisa jatah ${sa?.nama ?? dari} hanya ${rp(sa?.sisa ?? 0)}, tidak cukup untuk digeser ${rp(nominal)}.`;
    await this.r.insertTx(buatTx({ tipe: "geser", nominal, subPostId: a, subPostIdTujuan: b, tanggal: this.today, waMessageId: this.msg.id }));
    await this.muat();
    const ps2 = periodes(this.state);
    const h2 = hitungPeriode(this.state, ps2, ps2[ps2.length - 1]);
    const x = h2.pos.find((p) => p.subPostId === a)!;
    const y = h2.pos.find((p) => p.subPostId === b)!;
    return `Jatah digeser ${rp(nominal)} dari ${x.nama} ke ${y.nama} (periode ini saja, rencana tidak berubah). Sisa ${x.nama}: ${rp(x.sisa)}. Sisa ${y.nama}: ${rp(y.sisa)}.`;
  }

  private async kelolaPos(c: Extract<Cmd, { k: "pos" }>): Promise<string> {
    const state = this.state;
    const kata = c.args.split(" ");

    if (c.sub === "tambah") {
      const grupN = [...state.groups]
        .map((g) => ({ g, n: norm(g.nama), awal: norm(g.nama).split(" ")[0] }))
        .sort((x, y) => y.n.length - x.n.length);
      let grup: (typeof grupN)[number] | undefined;
      let pakai = 0;
      for (const cand of grupN) {
        const pn = cand.n.split(" ").length;
        if (norm(kata.slice(0, pn).join(" ")) === cand.n) { grup = cand; pakai = pn; break; }
      }
      if (!grup) {
        grup = grupN.find((x) => x.awal === norm(kata[0] ?? "")); // singkatan: "operasional", "keluarga"
        pakai = 1;
      }
      const nama = judul(kata.slice(pakai).join(" ").trim());
      if (!grup) return `Grup tidak dikenali. Grup yang ada: ${state.groups.map((g) => g.nama).join(", ")}. Contoh: pos tambah operasional laundry 50rb`;
      if (!nama) return "Nama pos kosong. Contoh: pos tambah operasional laundry 50rb";
      if (state.subPosts.some((s) => norm(s.nama) === norm(nama))) return `Pos "${nama}" sudah ada.`;
      const id = await this.r.addSubPost(grup.g.id, nama);
      await this.r.addAlias(id, norm(nama));
      await this.muat();
      const items = [...aktifPlan(this.state).items.map((i) => ({ ...i })), { tipe: "sub_pos" as const, subPostId: id, nominal: c.nominal ?? 0 }];
      await this.versiBaru(items);
      return `Pos ditambahkan: ${nama} (${grup.g.nama}), jatah ${rp(c.nominal ?? 0)}. Berlaku mulai periode berikutnya; untuk periode ini pakai "geser" bila perlu. ${this.ketTotalRencana(items.reduce((s, i) => s + i.nominal, 0))}`;
    }

    if (c.sub === "ganti") {
      for (let i = kata.length - 1; i >= 1; i--) {
        const id = cariPersis(state, kata.slice(0, i).join(" "));
        if (!id) continue;
        const baru = judul(kata.slice(i).join(" "));
        if (state.subPosts.some((s) => s.id !== id && norm(s.nama) === norm(baru))) return `Pos "${baru}" sudah ada.`;
        const lama = state.subPosts.find((s) => s.id === id)!.nama;
        await this.r.renameSubPost(id, baru);
        await this.r.addAlias(id, norm(baru));
        return `Pos "${lama}" diganti namanya menjadi "${baru}". Nama dan alias lama tetap bisa dipakai.`;
      }
      return `Format: pos ganti <nama lama> <nama baru>. Pos yang ada: ${daftarPilihan(state)}.`;
    }

    if (c.sub === "hapus") {
      const id = this.resolveSub(c.args);
      if (!id) return `Pos "${c.args}" tidak dikenali. Pilihan: ${daftarPilihan(state)}.`;
      if (id === state.config.bonusSubPostId) return "Pos ini dipakai sebagai tujuan bagian bonus, jadi tidak bisa dihapus.";
      const sp = state.subPosts.find((s) => s.id === id)!;
      await this.r.deactivateSubPost(id);
      const items = aktifPlan(state).items.filter((i) => !(i.tipe === "sub_pos" && i.subPostId === id)).map((i) => ({ ...i }));
      await this.versiBaru(items);
      return `Pos "${sp.nama}" dinonaktifkan (transaksi lama tetap tersimpan). Jatahnya hilang mulai periode berikutnya; periode ini tetap berjalan. ${this.ketTotalRencana(items.reduce((s, i) => s + i.nominal, 0))}`;
    }

    // alias: pos alias <alias> <pos>
    for (let i = 1; i < kata.length; i++) {
      const id = cariPersis(state, kata.slice(i).join(" "));
      if (!id) continue;
      const alias = norm(kata.slice(0, i).join(" "));
      if (!alias) break;
      const ada = state.aliases.find((a) => a.alias === alias);
      if (ada && ada.subPostId !== id) return `Alias "${alias}" sudah dipakai pos lain.`;
      await this.r.addAlias(id, alias);
      return `Alias "${alias}" ditambahkan ke ${state.subPosts.find((s) => s.id === id)!.nama}.`;
    }
    return "Format: pos alias <alias> <pos>. Contoh: pos alias gopay jajan";
  }

  // ---------- wadah ----------

  private async pindah(nominal: number, dari: Wadah, ke: Wadah, tipe: "tarik" | "pindah"): Promise<string> {
    const w = hitungWadah(this.state);
    if (dari !== "saldo" && w[dari] < nominal) return `Ditolak: isi ${dari} hanya ${rp(w[dari])}, kurang dari ${rp(nominal)}.`; // FR-36
    await this.r.insertTx(buatTx({ tipe, nominal, wadahAsal: dari, wadahTujuan: ke, tanggal: this.today, waMessageId: this.msg.id }));
    await this.muat();
    return `${tipe === "tarik" ? "Ditarik" : "Dipindahkan"} ${rp(nominal)} dari ${dari} ke ${ke}.\n${teksWadah(hitungWadah(this.state))}`;
  }

  private sisa(pos: string): string {
    const ps = periodes(this.state);
    if (!ps.length) return "Belum ada periode berjalan (periode awal belum punya jatah). Ketik gaji setelah gaji masuk.";
    const h = hitungPeriode(this.state, ps, ps[ps.length - 1]);
    const n = norm(pos);
    if (n === "dd" || n === "dana darurat") {
      return `Dana Darurat: sisa ${rp(h.ddSisa)} dari ${rp(h.dd)}${h.kekuranganDD ? `, kekurangan ${rp(h.kekuranganDD)} diambil dari Saldo` : ""}.`;
    }
    const id = this.resolveSub(pos);
    const st = id ? h.pos.find((x) => x.subPostId === id) : null;
    if (!st) return `Pos "${pos}" tidak dikenali. Pilihan: ${daftarPilihan(this.state)}, dd.`;
    return `${st.nama}: jatah efektif ${rp(st.efektif)}, terpakai ${rp(st.terpakai)}, sisa ${rp(st.sisa)}${st.lewat ? `, lewat ${rp(st.lewat)} (ditutup Dana Darurat)` : ""}.`;
  }

  // ---------- piutang / utang ----------

  private async debtTambah(jenis: "piutang" | "utang", nominal: number, nama: string, jatuhTempo: string | null): Promise<string> {
    const id = await this.r.addDebt({
      jenis,
      nama: judul(nama.trim()),
      nominal,
      dibayar: 0,
      tanggal: this.today,
      jatuhTempo,
      catatan: null,
    });
    await this.muat();
    const d = this.state.debts.find((x) => x.id === id)!;
    const label = jenis === "piutang" ? "Piutang (orang berutang ke kita)" : "Utang (kita berutang)";
    const jt = jatuhTempo ? ` Jatuh tempo ${tglPendek(jatuhTempo)}.` : "";
    return `${label} dicatat: ${rp(nominal)} atas nama ${d.nama}.${jt} Ketik "${jenis}" untuk lihat daftar, atau "lunasi ${jenis} ${d.nama}" bila sudah lunas.`;
  }

  private debtDaftar(jenis: "piutang" | "utang"): string {
    const aktif = this.state.debts.filter((d) => d.status === "aktif" && d.jenis === jenis);
    const label = jenis === "piutang" ? "Piutang aktif (orang berutang ke kita)" : "Utang aktif (kita berutang)";
    if (!aktif.length) return `${label}: tidak ada.`;
    const total = aktif.reduce((s, d) => s + (d.nominal - d.dibayar), 0);
    const baris = aktif.map((d) => {
      const sisa = d.nominal - d.dibayar;
      const lewat = d.jatuhTempo && d.jatuhTempo < this.today;
      return `- ${d.nama}: sisa ${rp(sisa)} dari ${rp(d.nominal)}${d.jatuhTempo ? `, jatuh tempo ${tglPendek(d.jatuhTempo)}${lewat ? " (lewat tempo)" : ""}` : ""}`;
    });
    return [`${label} (total ${rp(total)}):`, ...baris].join("\n");
  }

  private async debtBayar(jenis: "piutang" | "utang", nama: string, nominal: number | null): Promise<string> {
    const n = norm(nama);
    const cocok = this.state.debts.filter((d) => d.status === "aktif" && d.jenis === jenis && norm(d.nama).includes(n));
    if (!cocok.length) return `Tidak ada ${jenis} aktif atas nama "${nama}".`;
    if (cocok.length > 1) {
      return `Ada lebih dari satu ${jenis} cocok: ${cocok.map((d) => d.nama).join(", ")}. Sebutkan nama lebih lengkap.`;
    }
    const d = cocok[0];
    const sisa = d.nominal - d.dibayar;
    const bayar = nominal ?? sisa;
    if (bayar > sisa) return `Nominal ${rp(bayar)} melebihi sisa ${jenis} ${rp(sisa)}.`;
    const dibayar = d.dibayar + bayar;
    const lunas = dibayar >= d.nominal;
    await this.r.updateDebt(d.id, { dibayar, status: lunas ? "lunas" : "aktif" });
    await this.muat();
    const kataArah = jenis === "piutang" ? `diterima dari ${d.nama}` : `dibayar ke ${d.nama}`;
    return lunas
      ? `${rp(bayar)} ${kataArah}. ${judul(jenis)} ini lunas.`
      : `${rp(bayar)} ${kataArah}. Sisa ${jenis}: ${rp(d.nominal - dibayar)}.`;
  }

  private async ekspor(): Promise<string> {
    if (!this.deps.baseUrl) return "APP_BASE_URL belum diatur, tautan ekspor belum bisa dibuat.";
    const token = randomBytes(24).toString("hex");
    await this.r.addPending("ekspor", { hash: sha256(token) }, this.nowMs + EKSPOR_MS);
    return `Unduh semua transaksi (CSV). Tautan berlaku 15 menit dan hanya bisa dipakai sekali:\n${this.deps.baseUrl.replace(/\/$/, "")}/api/export?t=${token}`;
  }

  // ---------- bahasa bebas ----------

  private async bebas(teks: string): Promise<string> {
    const adaAngka = /\d/.test(teks);

    // Jawaban atas pertanyaan "untuk apa?" (FR-15)
    if (!adaAngka) {
      const p = await this.r.getPending(["petakan"]);
      if (p) {
        if (p.kedaluwarsaPada < this.nowMs) await this.r.resolvePending(p.id, "kedaluwarsa");
        else {
          const id = this.resolveSub(teks);
          const t = this.state.txs.find((x) => x.id === Number(p.payload.txId));
          const n = norm(teks);
          const lewati = ["tanpa pos", "lewati", "skip", "biarkan", "belum dipetakan", "0"].includes(n);
          if (!t || t.status !== "berlaku") await this.r.resolvePending(p.id, "batal");
          else if (lewati && !id) {
            await this.r.resolvePending(p.id, "selesai");
            return `Baik, ${rp(t.nominal + (t.biayaAdmin ?? 0))} tetap tanpa pos. Kamu bisa memetakannya nanti lewat "koreksi pos <nama pos>".`;
          } else if (id) {
            const sebelum = this.state;
            await this.r.updateTx(t.id, { subPostId: id });
            await this.r.resolvePending(p.id, "selesai");
            await this.muat();
            return `Dipetakan ke ${this.state.subPosts.find((s) => s.id === id)!.nama}.\n${this.balasOut(sebelum, t.id, { kind: "satu", id })}`;
          } else if (teks.trim().split(/\s+/).length <= 5) {
            return `Pos "${teks.trim()}" tidak dikenali. Balas salah satu: ${daftarPilihan(this.state)}.\nAtau "tanpa pos" untuk membiarkannya. Untuk pos baru: pos tambah operasional <nama> 0.`;
          }
        }
      }
      return TEKS_TIDAK_DIKENAL;
    }

    if (!this.deps.ai) return TEKS_FALLBACK_KAKU;
    const nama = this.state.subPosts.filter((s) => s.aktif).map((s) => s.nama);
    const raw = await this.deps.ai.parse(teks, nama); // hanya teks pesan + nama sub-pos (FR-74)
    const v = validasiAi(raw, teks, nama, this.today);
    if (!v.ok) {
      return v.alasan === "gaji" ? 'Untuk mencatat gaji, ketik: "gaji masuk 1.8 juta".' : TEKS_FALLBACK_KAKU; // FR-72
    }
    const h = v.hasil;
    const tanggal = h.tanggal ?? this.today;
    if (h.intent === "out") {
      const subId = h.subPos ? this.state.subPosts.find((s) => s.nama === h.subPos)?.id ?? null : null;
      return this.catatOut({ nominal: h.nominal, uraian: h.label ?? "", tanggal, sumber: "ai", subPostId: subId });
    }
    if (h.intent === "in") return this.catatIn(h.nominal, h.label ?? "", "saldo", tanggal, "ai");
    return this.bonus(h.nominal, null, "ai");
  }
}
