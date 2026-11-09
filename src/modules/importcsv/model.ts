import { createHash } from "node:crypto";
import { getPool, PgRepo } from "@/lib/pg-repo";
import { cariDalamTeks, cariPersis } from "@/lib/parse/pos";
import { tambahTransaksi, AksiError } from "@/lib/web-actions";
import type { InputTransaksi } from "@/lib/web-actions";

export function parseCsv(teks: string): string[][] {
  const baris: string[][] = [];
  let sel = "";
  let row: string[] = [];
  let kutip = false;
  const src = teks.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (kutip) {
      if (c === '"' && src[i + 1] === '"') { sel += '"'; i++; }
      else if (c === '"') kutip = false;
      else sel += c;
      continue;
    }
    if (c === '"') kutip = true;
    else if (c === "," || c === ";") { row.push(sel); sel = ""; }
    else if (c === "\n") { row.push(sel); baris.push(row); row = []; sel = ""; }
    else if (c !== "\r") sel += c;
  }
  if (sel || row.length) { row.push(sel); baris.push(row); }
  return baris.filter((r) => r.some((v) => v.trim() !== ""));
}

export function nominalDariCsv(nilai: string): number | null {
  let s = nilai.trim().replace(/rp/gi, "").replace(/\s/g, "");
  if (!s) return null;
  const koma = s.lastIndexOf(",");
  const titik = s.lastIndexOf(".");
  if (koma >= 0 && titik >= 0) {
    const desimal = Math.max(koma, titik);
    s = s.slice(0, desimal);
  } else if (koma >= 0) {
    const bagian = s.split(",");
    s = bagian.length > 2 || bagian[1]?.length === 3 ? bagian.join("") : bagian[0];
  } else if (titik >= 0) {
    const bagian = s.split(".");
    s = bagian.length === 2 && bagian[1].length <= 2 ? bagian[0] : bagian.join("");
  }
  s = s.replace(/[^0-9-]/g, "");
  if (!s || s === "-") return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}

export function tanggalDariCsv(nilai: string): string | null {
  const s = nilai.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s);
  if (m) {
    const tahun = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${tahun}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  m = /^(\d{1,2})\/(\d{1,2})$/.exec(s);
  if (m) {
    const tahun = new Date().getUTCFullYear();
    return `${tahun}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

function tipeDariCsv(nilai: string): "out" | "in" | null {
  const t = nilai.trim().toLowerCase();
  if (["out", "keluar", "pengeluaran", "debit", "db"].includes(t)) return "out";
  if (["in", "masuk", "pemasukan", "kredit", "cr"].includes(t)) return "in";
  return null;
}

const KOLOM = ["tanggal", "tipe", "nominal", "label", "pos", "biaya_admin", "wadah"] as const;

export async function imporTransaksi(userId: string, csv: string, hariIni: string) {
  const rows = parseCsv(csv);
  if (rows.length < 2) throw new AksiError("CSV minimal berisi header dan satu baris data.");
  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const idx = Object.fromEntries(KOLOM.map((k) => [k, header.indexOf(k)])) as Record<(typeof KOLOM)[number], number>;
  if (idx.tanggal < 0 || idx.tipe < 0 || idx.nominal < 0) throw new AksiError("Header wajib: tanggal, tipe, nominal.");
  if (rows.length > 1001) throw new AksiError("Maksimal 1000 baris per impor.");

  const repo = new PgRepo(undefined, undefined, userId);
  const state = await repo.load();
  const hasil = { ditambah: 0, dilewati: 0, gagal: 0 };
  const errors: string[] = [];

  for (let i = 1; i < rows.length; i++) {
    const line = i + 1;
    const row = rows[i];
    const tanggal = tanggalDariCsv(row[idx.tanggal] ?? "");
    const tipe = tipeDariCsv(row[idx.tipe] ?? "");
    const nominal = nominalDariCsv(row[idx.nominal] ?? "");
    if (!tanggal || tanggal > hariIni || !tipe || !nominal || nominal <= 0) {
      hasil.gagal += 1;
      if (errors.length < 12) errors.push(`Baris ${line}: tanggal/tipe/nominal tidak valid.`);
      continue;
    }
    const label = idx.label >= 0 ? (row[idx.label] ?? "").trim().slice(0, 120) || null : null;
    const posTeks = idx.pos >= 0 ? (row[idx.pos] ?? "").trim() : "";
    let subPostId = posTeks ? cariPersis(state, posTeks) : null;
    if (subPostId === null && (label || posTeks)) {
      const cocok = cariDalamTeks(state, posTeks || label || "");
      if (cocok.kind === "satu") subPostId = cocok.id;
    }
    const biayaAdmin = idx.biaya_admin >= 0 ? nominalDariCsv(row[idx.biaya_admin] ?? "") ?? 0 : 0;
    const wadah = idx.wadah >= 0 ? (row[idx.wadah] ?? "").trim().toLowerCase() : "";
    const hash = createHash("sha256").update([tanggal, tipe, nominal, label ?? "", subPostId ?? ""].join("|")).digest("hex").slice(0, 24);
    const sudah = await getPool().query(
      "SELECT 1 FROM transactions WHERE user_id = $1 AND detail->>'importHash' = $2 LIMIT 1",
      [userId, hash],
    );
    if (sudah.rowCount) { hasil.dilewati += 1; continue; }
    const input: InputTransaksi = {
      tipe,
      nominal,
      tanggal,
      label,
      subPostId,
      biayaAdmin: tipe === "out" ? biayaAdmin : 0,
      wadah: tipe === "in" && ["saldo", "tabungan", "investasi"].includes(wadah) ? wadah : undefined,
      detail: { importHash: hash, sumber: "csv" },
    };
    try {
      await tambahTransaksi(repo, hariIni, input);
      hasil.ditambah += 1;
    } catch (error) {
      hasil.gagal += 1;
      if (errors.length < 12) errors.push(`Baris ${line}: ${error instanceof Error ? error.message : "gagal"}`);
    }
  }

  return { ...hasil, errors };
}
