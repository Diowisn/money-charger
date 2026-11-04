import { buangSpan, parseAmount } from "./amount";
import { extractDate } from "./date";
import { WADAH, type DebtJenis, type Wadah } from "../types";

export type Cmd =
  | { k: "bantuan" | "saldo" | "laporan" | "laporan_periode" | "evaluasi" | "ekspor" }
  | { k: "ya" | "batal" | "setuju" | "tolak" | "hapus_terakhir" }
  | { k: "setup"; tanggal: string | null; saldo: number; tabungan: number; investasi: number }
  | { k: "out"; nominal: number; biayaAdmin: number; uraian: string; tanggal: string | null }
  | { k: "in"; nominal: number; label: string; wadah: Wadah; tanggal: string | null }
  | { k: "gaji"; nominal: number; tanggal: string | null }
  | { k: "bonus"; nominal: number; wadah: Wadah | null }
  | { k: "koreksi"; field: "nominal"; nominal: number }
  | { k: "koreksi"; field: "pos"; pos: string }
  | { k: "koreksi"; field: "tanggal"; tanggal: string }
  | { k: "set"; pos: string; nominal: number; sekarang: boolean }
  | { k: "geser"; nominal: number; dari: string; ke: string }
  | { k: "pos"; sub: "tambah" | "ganti" | "hapus" | "alias"; args: string; nominal?: number }
  | { k: "tarik"; wadah: Wadah; nominal: number }
  | { k: "pindah"; nominal: number; dari: Wadah; ke: Wadah }
  | { k: "sisa"; pos: string }
  | { k: "debt_add"; jenis: DebtJenis; nominal: number; nama: string; jatuhTempo: string | null }
  | { k: "debt_list"; jenis: DebtJenis }
  | { k: "debt_pay"; jenis: DebtJenis; nama: string; nominal: number | null }
  | { k: "error"; pesan: string }
  | { k: "bebas" };

const SATU_KATA: Record<string, Cmd> = {
  bantuan: { k: "bantuan" },
  saldo: { k: "saldo" },
  laporan: { k: "laporan" },
  evaluasi: { k: "evaluasi" },
  ekspor: { k: "ekspor" },
  ya: { k: "ya" },
  batal: { k: "batal" },
  setuju: { k: "setuju" },
  tolak: { k: "tolak" },
  piutang: { k: "debt_list", jenis: "piutang" },
  utang: { k: "debt_list", jenis: "utang" },
};

const AWAL_PERINTAH = new Set([
  "out", "in", "gaji", "bonus", "koreksi", "set", "geser", "pos", "tarik", "pindah", "sisa", "setup",
  "piutang", "utang", "lunasi", "bayar",
]);

const CONTOH: Record<string, string> = {
  out: "out 25rb kopi",
  in: "in 150rb freelance",
  gaji: "gaji masuk 1.8 juta",
  bonus: "bonus 200rb",
  koreksi: "koreksi nominal 30rb",
  set: "set makan 400rb",
  geser: "geser 50rb dari jajan ke bensin",
  pos: "pos tambah operasional laundry 50rb",
  tarik: "tarik tabungan 200rb",
  pindah: "pindah 100rb dari saldo ke tabungan",
  sisa: "sisa jajan",
  setup: "setup 17/10 saldo 300rb tabungan 0 investasi 0",
  piutang: "piutang 100rb Andi",
  utang: "utang 50rb Budi",
  lunasi: "lunasi piutang Andi",
  bayar: "bayar piutang Andi 50rb",
};

function isWadah(s: string): s is Wadah {
  return (WADAH as readonly string[]).includes(s);
}

const salah = (pesan: string): Cmd => ({ k: "error", pesan });
const format = (cmd: string): Cmd => salah(`Format kurang tepat. Contoh: ${CONTOH[cmd]}`);

/** Memisahkan "admin 2.500" / "biaya admin 2.500" dari teks pengeluaran. */
function pisahBiayaAdmin(teks: string): { rest: string; biayaAdmin: number; error?: string } {
  const m = /\b(?:(?:biaya)\s+)?admin\b\s*[:=]?\s*(\d[0-9.,]*(?:\s?(?:juta|jt|ribu|rb|k))?)(?![a-z0-9])/i.exec(teks);
  if (!m) return { rest: teks, biayaAdmin: 0 };
  const a = parseAmount(m[1], { izinkanNol: true });
  if (!a.ok) return { rest: teks, biayaAdmin: 0, error: `Biaya admin: ${a.pesan}` };
  const rest = `${teks.slice(0, m.index)} ${teks.slice(m.index + m[0].length)}`.replace(/\s+/g, " ").trim();
  return { rest, biayaAdmin: a.value };
}

export function parseCommand(raw: string, today: string): Cmd {
  const teks = raw.trim().replace(/\s+/g, " ");
  const low = teks.toLowerCase();
  if (!low) return { k: "bebas" };

  if (SATU_KATA[low]) return SATU_KATA[low];
  if (low === "laporan periode") return { k: "laporan_periode" };
  if (low === "hapus terakhir") return { k: "hapus_terakhir" };

  const spasi = low.indexOf(" ");
  const kata = spasi === -1 ? low : low.slice(0, spasi);
  if (!AWAL_PERINTAH.has(kata) || spasi === -1) {
    // perintah yang butuh argumen tapi diketik sendirian
    if (AWAL_PERINTAH.has(kata) && spasi === -1) return format(kata);
    return { k: "bebas" };
  }
  const sisa = teks.slice(spasi + 1).trim();
  const sisaLow = sisa.toLowerCase();

  switch (kata) {
    case "out": {
      const admin = pisahBiayaAdmin(sisa);
      if (admin.error) return salah(admin.error);
      const d = extractDate(admin.rest, today);
      if (d.error) return salah(d.error);
      const a = parseAmount(d.rest);
      if (!a.ok) return salah(a.pesan);
      return {
        k: "out",
        nominal: a.value,
        biayaAdmin: admin.biayaAdmin,
        uraian: buangSpan(d.rest, a.start, a.end),
        tanggal: d.date,
      };
    }

    case "in": {
      const d = extractDate(sisa, today);
      if (d.error) return salah(d.error);
      let rest = d.rest;
      let wadah: Wadah = "saldo";
      const m = /\bke\s+(saldo|tabungan|investasi)\s*$/i.exec(rest);
      if (m) {
        wadah = m[1].toLowerCase() as Wadah;
        rest = rest.slice(0, m.index).trim();
      }
      const a = parseAmount(rest);
      if (!a.ok) return salah(a.pesan);
      return { k: "in", nominal: a.value, label: buangSpan(rest, a.start, a.end), wadah, tanggal: d.date };
    }

    case "gaji": {
      const d = extractDate(sisa.replace(/^masuk\s+/i, ""), today);
      if (d.error) return salah(d.error);
      const a = parseAmount(d.rest);
      if (!a.ok) return salah(a.pesan);
      // Gaji menutup periode, jadi sintaksnya ketat: tidak boleh ada kata lain selain nominal.
      if (buangSpan(d.rest, a.start, a.end) !== "") return format("gaji");
      return { k: "gaji", nominal: a.value, tanggal: d.date };
    }

    case "bonus": {
      let rest = sisa;
      let wadah: Wadah | null = null;
      const m = /\bke\s+(\S+)\s*$/i.exec(rest);
      if (m) {
        const w = m[1].toLowerCase();
        if (!isWadah(w)) return salah("Tujuan bonus: saldo, tabungan, atau investasi.");
        wadah = w;
        rest = rest.slice(0, m.index).trim();
      }
      const a = parseAmount(rest);
      if (!a.ok) return salah(a.pesan);
      return { k: "bonus", nominal: a.value, wadah };
    }

    case "koreksi": {
      const m = /^(nominal|pos|tanggal)\s+(.+)$/i.exec(sisa);
      if (!m) return format("koreksi");
      const field = m[1].toLowerCase();
      if (field === "nominal") {
        const a = parseAmount(m[2]);
        return a.ok ? { k: "koreksi", field: "nominal", nominal: a.value } : salah(a.pesan);
      }
      if (field === "pos") return { k: "koreksi", field: "pos", pos: m[2] };
      const d = extractDate(m[2], today);
      if (d.error) return salah(d.error);
      if (!d.date) return salah("Tanggal tidak terbaca. Contoh: koreksi tanggal kemarin");
      return { k: "koreksi", field: "tanggal", tanggal: d.date };
    }

    case "set": {
      let rest = sisa;
      let sekarang = false;
      if (/\bsekarang\s*$/i.test(rest)) {
        sekarang = true;
        rest = rest.replace(/\bsekarang\s*$/i, "").trim();
      }
      const a = parseAmount(rest, { izinkanNol: true });
      if (!a.ok) return salah(a.pesan);
      const pos = buangSpan(rest, a.start, a.end);
      if (!pos) return format("set");
      return { k: "set", pos, nominal: a.value, sekarang };
    }

    case "geser": {
      const m = /^(.*?)\s*\bdari\b\s+(.+?)\s+\bke\b\s+(.+)$/i.exec(sisa);
      if (!m) return format("geser");
      const a = parseAmount(m[1]);
      if (!a.ok) return salah(a.pesan);
      return { k: "geser", nominal: a.value, dari: m[2].trim(), ke: m[3].trim() };
    }

    case "pos": {
      const m = /^(tambah|ganti|hapus|alias)\s+(.+)$/i.exec(sisa);
      if (!m) return format("pos");
      const sub = m[1].toLowerCase() as "tambah" | "ganti" | "hapus" | "alias";
      if (sub === "tambah") {
        const a = parseAmount(m[2], { izinkanNol: true });
        if (!a.ok) return salah(a.pesan);
        return { k: "pos", sub, args: buangSpan(m[2], a.start, a.end), nominal: a.value };
      }
      return { k: "pos", sub, args: m[2].trim() };
    }

    case "tarik": {
      const m = /^(\S+)\s+(.+)$/.exec(sisaLow);
      if (!m || !isWadah(m[1]) || m[1] === "saldo") return salah("Tarik dari tabungan atau investasi. Contoh: tarik tabungan 200rb");
      const a = parseAmount(m[2]);
      return a.ok ? { k: "tarik", wadah: m[1], nominal: a.value } : salah(a.pesan);
    }

    case "pindah": {
      const m = /^(.*?)\s*\bdari\s+(\S+)\s+ke\s+(\S+)\s*$/i.exec(sisaLow);
      if (!m) return format("pindah");
      const a = parseAmount(m[1]);
      if (!a.ok) return salah(a.pesan);
      if (!isWadah(m[2]) || !isWadah(m[3])) return salah("Wadah yang valid: saldo, tabungan, investasi.");
      if (m[2] === m[3]) return salah("Wadah asal dan tujuan harus berbeda.");
      return { k: "pindah", nominal: a.value, dari: m[2], ke: m[3] };
    }

    case "sisa":
      return { k: "sisa", pos: sisa };

    case "piutang":
    case "utang": {
      const jenis = kata as DebtJenis;
      if (!sisa) return { k: "debt_list", jenis };
      const d = extractDate(sisa, today);
      if (d.error) return salah(d.error);
      const a = parseAmount(d.rest);
      if (!a.ok) return salah(a.pesan);
      const nama = buangSpan(d.rest, a.start, a.end);
      if (!nama) return format(kata);
      return { k: "debt_add", jenis, nominal: a.value, nama, jatuhTempo: d.date };
    }

    case "lunasi": {
      const m = /^(piutang|utang)\s+(.+)$/i.exec(sisa);
      if (!m) return format("lunasi");
      return { k: "debt_pay", jenis: m[1].toLowerCase() as DebtJenis, nama: m[2].trim(), nominal: null };
    }

    case "bayar": {
      const m = /^(piutang|utang)\s+(.+?)\s+(\S+(?:\s*(?:juta|jt|ribu|rb|k))?)$/i.exec(sisa);
      if (!m) return format("bayar");
      const a = parseAmount(m[3]);
      if (!a.ok) return salah(a.pesan);
      return { k: "debt_pay", jenis: m[1].toLowerCase() as DebtJenis, nama: m[2].trim(), nominal: a.value };
    }

    case "setup": {
      const d = extractDate(sisa, today);
      if (d.error) return salah(d.error);
      const nilai = (nama: string): number | string => {
        const m = new RegExp(`\\b${nama}\\s+(\\S+(?:\\s+(?:juta|jt|ribu|rb))?)`, "i").exec(d.rest);
        if (!m) return 0;
        const a = parseAmount(m[1], { izinkanNol: true });
        return a.ok ? a.value : a.pesan;
      };
      const s = nilai("saldo");
      const t = nilai("tabungan");
      const i = nilai("investasi");
      for (const v of [s, t, i]) if (typeof v === "string") return salah(v);
      return { k: "setup", tanggal: d.date, saldo: s as number, tabungan: t as number, investasi: i as number };
    }
  }
  return { k: "bebas" };
}
