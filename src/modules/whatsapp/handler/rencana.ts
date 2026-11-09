import {
  aktifPlan,
  evaluasi,
  hitungPeriode,
  itemUsulan,
  nominalItem,
  periodes,
  planById,
  totalPlan,
} from "@/lib/engine";
import { rp } from "@/lib/format";
import type { Cmd } from "@/lib/parse/command";
import { cariDalamTeks, cariPersis, daftarPilihan, norm } from "@/lib/parse/pos";
import { selisihBertanda, teksRencanaVsKenyataan, teksUsulan } from "@/lib/report";
import { buatTx, type PlanItem } from "@/lib/types";
import type { SesiApi } from "./types";
import { judul } from "./util";

export function ketTotalRencana(s: SesiApi, R: number): string {
  const pokok = s.state.config.gajiPokok;
  return R === pokok
    ? `Total rencana ${rp(R)}, sesuai gaji pokok.`
    : `Total rencana ${rp(R)}, selisih ${selisihBertanda(R - pokok)} dari gaji pokok ${rp(pokok)} (hanya peringatan, tidak ditolak).`;
}

export function resolveSub(s: SesiApi, teks: string): number | null {
  const id = cariPersis(s.state, teks);
  if (id) return id;
  const k = cariDalamTeks(s.state, teks);
  return k.kind === "satu" ? k.id : null;
}

export async function versiBaru(s: SesiApi, items: PlanItem[]): Promise<number> {
  await s.r.setPlanStatus(aktifPlan(s.state).id, "arsip");
  return s.r.createPlanVersion(`Rencana ${s.state.plans.length + 1}`, "aktif", items);
}

export async function setRencana(s: SesiApi, pos: string, nominal: number, sekarang: boolean): Promise<string> {
  const n = norm(pos);
  let tipe: PlanItem["tipe"];
  let subId: number | null = null;
  let label: string;
  if (n === "dd" || n === "dana darurat") { tipe = "dd"; label = "Dana Darurat"; }
  else if (n === "tabungan") { tipe = "tabungan"; label = "Tabungan"; }
  else if (n === "investasi") { tipe = "investasi"; label = "Investasi"; }
  else {
    subId = resolveSub(s, pos);
    if (!subId) return `Pos "${pos}" tidak dikenali. Pilihan: ${daftarPilihan(s.state)}, dd, tabungan, investasi.`;
    tipe = "sub_pos";
    label = s.state.subPosts.find((s) => s.id === subId)!.nama;
  }
  if (sekarang && (tipe === "tabungan" || tipe === "investasi")) {
    return `Tabungan dan Investasi hanya bisa berubah mulai periode berikutnya karena sudah dipotong saat gaji masuk. Untuk menambah sekarang, pakai: pindah 100rb dari saldo ke ${tipe}.`;
  }

  const aktif = aktifPlan(s.state);
  const lama = nominalItem(aktif, tipe, subId);
  const items = aktif.items.map((i) => ({ ...i }));
  const it = items.find((i) => i.tipe === tipe && i.subPostId === subId);
  if (it) it.nominal = nominal;
  else items.push({ tipe, subPostId: subId, nominal });

  const idBaru = await versiBaru(s, items); // FR-54: versi baru, versi lama tersimpan
  let ket = "Berlaku mulai periode berikutnya.";
  const ps = periodes(s.state);
  if (sekarang) {
    if (!ps.length) ket = "Belum ada periode berjalan; berlaku sejak gaji pertama.";
    else {
      const cur = ps[ps.length - 1];
      const planCur = planById(s.state, cur.planId);
      const jatahTotal = (pl: { items: PlanItem[] }) => pl.items.filter((i) => i.tipe === "sub_pos" || i.tipe === "dd").reduce((s, i) => s + i.nominal, 0);
      const delta = jatahTotal({ items }) - jatahTotal(planCur);
      await s.r.setGajiPlan(cur.gaji.id, idBaru);
      if (delta !== 0) {
        await s.r.insertTx(
          buatTx({
            tipe: "selisih_gaji",
            nominal: Math.abs(delta),
            wadahAsal: delta > 0 ? "saldo" : null,
            wadahTujuan: delta < 0 ? "saldo" : null,
            tanggal: s.today,
            indukId: cur.gaji.id,
          }),
        );
      }
      ket = `Berlaku juga di periode berjalan${delta ? `; selisih ${selisihBertanda(delta)} jatah ${delta > 0 ? "diambil dari" : "dikembalikan ke"} Saldo` : ""}.`;
    }
  }
  return `${label}: ${rp(lama)} jadi ${rp(nominal)}. ${ket} ${ketTotalRencana(s, totalPlan({ ...aktif, items }))}`;
}

export async function geser(s: SesiApi, nominal: number, dari: string, ke: string): Promise<string> {
  const ps = periodes(s.state);
  if (!ps.length) return "Geser jatah baru bisa dipakai setelah gaji pertama dicatat (periode awal belum punya jatah).";
  const a = resolveSub(s, dari);
  const b = resolveSub(s, ke);
  if (!a) return `Pos asal "${dari}" tidak dikenali. Pilihan: ${daftarPilihan(s.state)}.`;
  if (!b) return `Pos tujuan "${ke}" tidak dikenali. Pilihan: ${daftarPilihan(s.state)}.`;
  if (a === b) return "Pos asal dan tujuan harus berbeda.";
  const h = hitungPeriode(s.state, ps, ps[ps.length - 1]);
  const sa = h.pos.find((x) => x.subPostId === a);
  if (!sa || sa.sisa < nominal) return `Sisa jatah ${sa?.nama ?? dari} hanya ${rp(sa?.sisa ?? 0)}, tidak cukup untuk digeser ${rp(nominal)}.`;
  await s.r.insertTx(buatTx({ tipe: "geser", nominal, subPostId: a, subPostIdTujuan: b, tanggal: s.today, waMessageId: s.msg.id }));
  await s.muat();
  const ps2 = periodes(s.state);
  const h2 = hitungPeriode(s.state, ps2, ps2[ps2.length - 1]);
  const x = h2.pos.find((p) => p.subPostId === a)!;
  const y = h2.pos.find((p) => p.subPostId === b)!;
  return `Jatah digeser ${rp(nominal)} dari ${x.nama} ke ${y.nama} (periode ini saja, rencana tidak berubah). Sisa ${x.nama}: ${rp(x.sisa)}. Sisa ${y.nama}: ${rp(y.sisa)}.`;
}

export async function kelolaPos(s: SesiApi, c: Extract<Cmd, { k: "pos" }>): Promise<string> {
  const state = s.state;
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
    if (state.subPosts.some((x) => norm(x.nama) === norm(nama))) return `Pos "${nama}" sudah ada.`;
    const id = await s.r.addSubPost(grup.g.id, nama);
    await s.r.addAlias(id, norm(nama));
    await s.muat();
    const items = [...aktifPlan(s.state).items.map((i) => ({ ...i })), { tipe: "sub_pos" as const, subPostId: id, nominal: c.nominal ?? 0 }];
    await versiBaru(s, items);
    return `Pos ditambahkan: ${nama} (${grup.g.nama}), jatah ${rp(c.nominal ?? 0)}. Berlaku mulai periode berikutnya; untuk periode ini pakai "geser" bila perlu. ${ketTotalRencana(s, items.reduce((n, i) => n + i.nominal, 0))}`;
  }

  if (c.sub === "ganti") {
    for (let i = kata.length - 1; i >= 1; i--) {
      const id = cariPersis(state, kata.slice(0, i).join(" "));
      if (!id) continue;
      const baru = judul(kata.slice(i).join(" "));
      if (state.subPosts.some((x) => x.id !== id && norm(x.nama) === norm(baru))) return `Pos "${baru}" sudah ada.`;
      const lama = state.subPosts.find((x) => x.id === id)!.nama;
      await s.r.renameSubPost(id, baru);
      await s.r.addAlias(id, norm(baru));
      return `Pos "${lama}" diganti namanya menjadi "${baru}". Nama dan alias lama tetap bisa dipakai.`;
    }
    return `Format: pos ganti <nama lama> <nama baru>. Pos yang ada: ${daftarPilihan(state)}.`;
  }

  if (c.sub === "hapus") {
    const id = resolveSub(s, c.args);
    if (!id) return `Pos "${c.args}" tidak dikenali. Pilihan: ${daftarPilihan(state)}.`;
    if (id === state.config.bonusSubPostId) return "Pos ini dipakai sebagai tujuan bagian bonus, jadi tidak bisa dihapus.";
    const sp = state.subPosts.find((x) => x.id === id)!;
    await s.r.deactivateSubPost(id);
    const items = aktifPlan(state).items.filter((i) => !(i.tipe === "sub_pos" && i.subPostId === id)).map((i) => ({ ...i }));
    await versiBaru(s, items);
    return `Pos "${sp.nama}" dinonaktifkan (transaksi lama tetap tersimpan). Jatahnya hilang mulai periode berikutnya; periode ini tetap berjalan. ${ketTotalRencana(s, items.reduce((n, i) => n + i.nominal, 0))}`;
  }

  // alias: pos alias <alias> <pos>
  for (let i = 1; i < kata.length; i++) {
    const id = cariPersis(state, kata.slice(i).join(" "));
    if (!id) continue;
    const alias = norm(kata.slice(0, i).join(" "));
    if (!alias) break;
    const ada = state.aliases.find((a) => a.alias === alias);
    if (ada && ada.subPostId !== id) return `Alias "${alias}" sudah dipakai pos lain.`;
    await s.r.addAlias(id, alias);
    return `Alias "${alias}" ditambahkan ke ${state.subPosts.find((x) => x.id === id)!.nama}.`;
  }
  return "Format: pos alias <alias> <pos>. Contoh: pos alias gopay jajan";
}

/** Membuat versi rencana 'usulan' dari evaluasi; usulan lama dibuang. */
export async function buatUsulan(s: SesiApi): Promise<string[]> {
  const ev = evaluasi(s.state);
  if (ev.tanpaData) return ["Usulan angka belum dibuat: belum ada pengeluaran tercatat di periode yang ditutup."];
  if (!ev.usulan) return [];
  for (const p of s.state.plans.filter((x) => x.status === "usulan")) await s.r.setPlanStatus(p.id, "arsip");
  if (!ev.usulan.some((u) => u.baru !== u.lama)) {
    return ["Usulan: tidak ada perubahan, jatah sekarang sudah sesuai rata-rata pemakaian."];
  }
  const n = s.state.plans.filter((p) => p.nama.startsWith("Usulan")).length + 1;
  await s.r.createPlanVersion(`Usulan ${n}`, "usulan", itemUsulan(aktifPlan(s.state), ev.usulan));
  return teksUsulan(ev);
}

export async function evaluasiManual(s: SesiApi): Promise<string> {
  const ev = evaluasi(s.state);
  if (!ev.acuan) return "Belum ada data periode. Evaluasi tersedia setelah gaji pertama dicatat.";
  const baris: string[] = [];
  if (ev.periodeDipakai === 0) {
    baris.push(...teksRencanaVsKenyataan(ev.acuan));
    baris.push("Belum ada periode yang tertutup, jadi belum ada usulan angka. Usulan dibuat setelah gaji berikutnya dicatat.");
    return baris.join("\n");
  }
  baris.push(...teksRencanaVsKenyataan(ev.acuan), "");
  const usulan = await buatUsulan(s);
  baris.push(...usulan);
  return baris.join("\n");
}

export async function usulan(s: SesiApi, aksi: "setuju" | "tolak"): Promise<string> {
  const u = [...s.state.plans].reverse().find((p) => p.status === "usulan");
  if (!u) return 'Tidak ada usulan yang menunggu. Ketik "evaluasi" untuk membuatnya.';
  if (aksi === "tolak") {
    await s.r.setPlanStatus(u.id, "arsip");
    return "Usulan dibuang. Rencana tidak berubah.";
  }
  await s.r.setPlanStatus(aktifPlan(s.state).id, "arsip");
  await s.r.setPlanStatus(u.id, "aktif");
  const R = totalPlan(u);
  return `Usulan dipakai mulai periode berikutnya. ${ketTotalRencana(s, R)}`;
}
