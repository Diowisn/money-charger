import {
  aktifPlan,
  bagiBonus,
  hitungPeriode,
  hitungWadah,
  indeksPeriode,
  nominalItem,
  periodes,
  totalPlan,
} from "@/lib/engine";
import { rp, tglPendek } from "@/lib/format";
import { diffDays } from "@/lib/parse/date";
import type { Cmd } from "@/lib/parse/command";
import { cariDalamTeks, daftarPilihan, type Kecocokan } from "@/lib/parse/pos";
import { barisGrup, selisihBertanda, teksRencanaVsKenyataan } from "@/lib/report";
import { buatTx, type State, type Tx, type Wadah } from "@/lib/types";
import { KONFIRMASI_MS, PETAKAN_MS } from "./konstanta";
import { buatUsulan } from "./rencana";
import type { SesiApi } from "./types";
import { judul } from "./util";

export async function setup(s: SesiApi, c: Extract<Cmd, { k: "setup" }>): Promise<string> {
  if (periodes(s.state).length > 0) {
    return "Setup hanya bisa diulang sebelum gaji pertama dicatat, karena hitungan periode sudah berjalan. Hapus gaji pertama dulu (hapus terakhir) bila perlu.";
  }
  const tgl = c.tanggal ?? s.today;
  await s.r.setConfig("tanggal_mulai", tgl);
  await s.r.setConfig("saldo_awal", String(c.saldo));
  await s.r.setConfig("tabungan_awal", String(c.tabungan));
  await s.r.setConfig("investasi_awal", String(c.investasi));
  return `Setup tersimpan: mulai ${tglPendek(tgl)}, Saldo ${rp(c.saldo)}, Tabungan ${rp(c.tabungan)}, Investasi ${rp(c.investasi)}.`;
}

export async function catatOut(
  s: SesiApi,
  p: {
    nominal: number;
    biayaAdmin?: number;
    uraian: string;
    tanggal: string;
    sumber: "kaku" | "ai";
    subPostId?: number | null;
  },
): Promise<string> {
  const sebelum = s.state;
  let kec: Kecocokan;
  let sub: number | null = null;
  if (p.subPostId !== undefined) {
    sub = p.subPostId;
    kec = sub ? { kind: "satu", id: sub } : { kind: "none" };
  } else {
    kec = cariDalamTeks(s.state, p.uraian);
    if (kec.kind === "satu") sub = kec.id;
  }
  const id = await s.r.insertTx(
    buatTx({
      tipe: "out",
      nominal: p.nominal,
      biayaAdmin: p.biayaAdmin ?? 0,
      subPostId: sub,
      tanggal: p.tanggal,
      label: p.uraian || null,
      sumber: p.sumber,
      waMessageId: s.msg.id,
    }),
  );
  if (sub === null) await s.r.addPending("petakan", { txId: id }, s.nowMs + PETAKAN_MS);
  await s.muat();
  return balasOut(s, sebelum, id, kec);
}

export function balasOut(s: SesiApi, sebelum: State, txId: number, kec: Kecocokan): string {
  const state = s.state;
  const t = state.txs.find((x) => x.id === txId)!;
  const sub = t.subPostId ? state.subPosts.find((x) => x.id === t.subPostId)! : null;
  const ps = periodes(state);
  const cur = ps.length;
  const idx = indeksPeriode(ps, t.tanggal);
  const w = hitungWadah(state);
  const ai = t.sumber === "ai";

  const total = t.nominal + (t.biayaAdmin ?? 0);
  const admin = t.biayaAdmin > 0 ? ` + admin ${rp(t.biayaAdmin)} (total ${rp(total)})` : "";
  let kepala = `Tercatat${ai ? " (dibaca AI)" : ""}: ${rp(t.nominal)}${admin}, ${sub ? sub.nama : "belum dipetakan"}`;
  if (t.tanggal !== s.today) kepala += ` (tgl ${tglPendek(t.tanggal)})`;
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

export async function catatIn(
  s: SesiApi,
  nominal: number,
  label: string,
  wadah: Wadah,
  tanggal: string,
  sumber: "kaku" | "ai",
): Promise<string> {
  await s.r.insertTx(
    buatTx({ tipe: "in", nominal, wadahTujuan: wadah, tanggal, label: label || null, sumber, waMessageId: s.msg.id }),
  );
  await s.muat();
  const w = hitungWadah(s.state);
  const baris = [
    `Pemasukan tercatat${sumber === "ai" ? " (dibaca AI)" : ""}: ${rp(nominal)}${label ? `, ${label}` : ""}, ke ${wadah}.`,
    `${judul(wadah)} sekarang: ${rp(w[wadah])}.`,
  ];
  if (sumber === "ai") baris.push('Salah? Ketik "hapus terakhir".');
  return baris.join("\n");
}

export async function gaji(s: SesiApi, nominal: number, tanggal: string, lewatiCek: boolean): Promise<string> {
  if (tanggal > s.today) return "Tanggal gaji di masa depan ditolak.";
  const ps = periodes(s.state);

  if (!lewatiCek && ps.length >= 1) {
    const terakhir = ps[ps.length - 1].start;
    const jarak = diffDays(tanggal, terakhir);
    if (jarak < s.state.config.ambangGajiGanda) {
      await s.r.addPending("gaji_ganda", { nominal, tanggal }, s.nowMs + KONFIRMASI_MS);
      const ket =
        jarak < 0
          ? `tanggalnya lebih awal dari gaji terakhir (${tglPendek(terakhir)})`
          : `baru ${jarak} hari setelah gaji terakhir (${tglPendek(terakhir)}), batas wajar ${s.state.config.ambangGajiGanda} hari`;
      return `Gaji ${rp(nominal)} tgl ${tglPendek(tanggal)}: ${ket}. Data belum diubah. Balas "ya" untuk tetap mencatat dan menutup periode, atau "batal".`;
    }
  }

  const plan = aktifPlan(s.state);
  const R = totalPlan(plan);
  const tab = nominalItem(plan, "tabungan");
  const inv = nominalItem(plan, "investasi");

  const gid = await s.r.insertTx(
    buatTx({ tipe: "gaji", nominal, tanggal, planVersionId: plan.id, waMessageId: s.msg.id }),
  );
  if (tab > 0) await s.r.insertTx(buatTx({ tipe: "alokasi_gaji", nominal: tab, wadahTujuan: "tabungan", tanggal, indukId: gid }));
  if (inv > 0) await s.r.insertTx(buatTx({ tipe: "alokasi_gaji", nominal: inv, wadahTujuan: "investasi", tanggal, indukId: gid }));
  if (nominal !== R) {
    const d = nominal - R;
    await s.r.insertTx(
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
  await s.muat();

  const state = s.state;
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
    const usulan = await buatUsulan(s);
    if (usulan.length) baris.push("", ...usulan);
  }
  if (idxBaru < ps2.length) baris.push("", "Catatan: gaji ini diberi tanggal lebih awal dari gaji yang sudah ada, jadi batas periode berubah.");
  return baris.join("\n");
}

export async function bonus(
  s: SesiApi,
  nominal: number,
  wadah: Wadah | null,
  sumber: "kaku" | "ai",
): Promise<string> {
  const state = s.state;
  const ps = periodes(state);
  const berjalan = ps.length > 0 && ps[ps.length - 1].start <= s.today;
  const labelAi = sumber === "ai" ? " (dibaca AI)" : "";
  const akhir = sumber === "ai" ? '\nSalah? Ketik "hapus terakhir".' : "";

  if (wadah || !berjalan) {
    const tujuan = wadah ?? "saldo";
    await s.r.insertTx(
      buatTx({ tipe: "bonus", nominal, wadahTujuan: tujuan, tanggal: s.today, sumber, waMessageId: s.msg.id }),
    );
    await s.muat();
    const ket = !wadah ? " (periode awal: belum ada jatah Jajan, seluruhnya ke Saldo)" : "";
    return `Bonus${labelAi} ${rp(nominal)} masuk ke ${tujuan}${ket}. ${judul(tujuan)} sekarang: ${rp(hitungWadah(s.state)[tujuan])}.${akhir}`;
  }

  const { jajan, saldo } = bagiBonus(nominal, state.config.persenJajan);
  const subId = state.config.bonusSubPostId;
  const sub = state.subPosts.find((s) => s.id === subId && s.aktif);
  const gid = await s.r.insertTx(
    buatTx({ tipe: "bonus", nominal, tanggal: s.today, sumber, waMessageId: s.msg.id }),
  );
  if (!sub) {
    await s.r.insertTx(buatTx({ tipe: "bonus", nominal, wadahTujuan: "saldo", tanggal: s.today, indukId: gid }));
    await s.muat();
    return `Bonus${labelAi} ${rp(nominal)} masuk ke Saldo (pos Jajan tidak aktif, jadi tidak dibagi).${akhir}`;
  }
  if (saldo > 0) await s.r.insertTx(buatTx({ tipe: "bonus", nominal: saldo, wadahTujuan: "saldo", tanggal: s.today, indukId: gid }));
  if (jajan > 0) await s.r.insertTx(buatTx({ tipe: "tambahan_jatah", nominal: jajan, subPostId: sub.id, tanggal: s.today, indukId: gid }));
  await s.muat();
  const ps2 = periodes(s.state);
  const h = hitungPeriode(s.state, ps2, ps2[ps2.length - 1]);
  const st = h.pos.find((x) => x.subPostId === sub.id);
  return `Bonus${labelAi} ${rp(nominal)} dibagi: Saldo +${rp(saldo)}, jatah ${sub.nama} periode ini +${rp(jajan)}. Sisa jatah ${sub.nama}: ${rp(st?.sisa ?? 0)}. Saldo sekarang: ${rp(hitungWadah(s.state).saldo)}.${akhir}`;
}

export function deskripsi(s: SesiApi, t: Tx): string {
  const sub = t.subPostId ? s.state.subPosts.find((x) => x.id === t.subPostId)?.nama : null;
  const jenis: Record<string, string> = { out: "pengeluaran", in: "pemasukan", gaji: "gaji", bonus: "bonus", tarik: "penarikan", pindah: "pemindahan", geser: "geser jatah" };
  const admin = t.biayaAdmin > 0 ? ` + admin ${rp(t.biayaAdmin)}` : "";
  return `${jenis[t.tipe] ?? t.tipe} ${rp(t.nominal)}${admin}${sub ? ` (${sub})` : ""} tgl ${tglPendek(t.tanggal)}`;
}
