import type { TxView } from "./dashboard";

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const RP = '"Rp"#,##0;[Red]-"Rp"#,##0';
const HITAM = "FF1F2937";
const BIRU = "FF1F4E79";
const ABU = "FFF3F4F6";

const MASUK = new Set(["in", "gaji", "bonus"]);

type Baris = TxView;

function labelBulan(kunci: string) {
  const [tahun, bulan] = kunci.split("-").map(Number);
  return `${BULAN[bulan - 1] ?? kunci} ${tahun}`;
}

function keTanggal(iso: string) {
  const [tahun, bulan, hari] = iso.split("-").map(Number);
  return new Date(tahun, bulan - 1, hari);
}

function rupiah(n: number) {
  return n.toLocaleString("id-ID");
}

function bulanDari(t: Baris) {
  return t.tanggal.slice(0, 7);
}

interface Ringkas {
  masuk: number;
  keluar: number;
  admin: number;
  jumlah: number;
  batal: number;
}

function ringkas(txs: Baris[]): Ringkas {
  const r: Ringkas = { masuk: 0, keluar: 0, admin: 0, jumlah: 0, batal: 0 };
  for (const t of txs) {
    if (t.status === "batal") {
      r.batal += 1;
      continue;
    }
    r.jumlah += 1;
    if (MASUK.has(t.tipe)) r.masuk += t.nominal;
    if (t.tipe === "out") {
      r.keluar += t.nominal;
      r.admin += t.biayaAdmin;
    }
  }
  return r;
}

export async function buatXlsx(txs: TxView[], namaTipe: Record<string, string>) {
  const { Workbook } = await import("exceljs");
  const wb = new Workbook();
  wb.creator = "Money Charger";
  wb.created = new Date();
  wb.title = "Rekap Transaksi";

  const tepi = {
    top: { style: "thin" as const, color: { argb: "FFD1D5DB" } },
    left: { style: "thin" as const, color: { argb: "FFD1D5DB" } },
    bottom: { style: "thin" as const, color: { argb: "FFD1D5DB" } },
    right: { style: "thin" as const, color: { argb: "FFD1D5DB" } },
  };

  const judul = (ws: import("exceljs").Worksheet, teks: string, lebar: number) => {
    ws.mergeCells(1, 1, 1, lebar);
    const sel = ws.getCell(1, 1);
    sel.value = teks;
    sel.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
    sel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BIRU } };
    sel.alignment = { vertical: "middle", horizontal: "left" };
    ws.getRow(1).height = 28;
    ws.mergeCells(2, 1, 2, lebar);
    const sub = ws.getCell(2, 1);
    sub.value = `Dibuat ${new Date().toLocaleString("id-ID")}`;
    sub.font = { italic: true, size: 10, color: { argb: "FF6B7280" } };
  };

  const kepala = (ws: import("exceljs").Worksheet, baris: number, kolom: string[]) => {
    const row = ws.getRow(baris);
    row.height = 24;
    kolom.forEach((teks, i) => {
      const sel = row.getCell(i + 1);
      sel.value = teks;
      sel.font = { bold: true, color: { argb: "FFFFFFFF" } };
      sel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HITAM } };
      sel.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      sel.border = tepi;
    });
    ws.views = [{ state: "frozen", ySplit: baris }];
    ws.autoFilter = { from: { row: baris, column: 1 }, to: { row: baris, column: kolom.length } };
  };

  const isi = (ws: import("exceljs").Worksheet, baris: number, nilai: (string | number | Date | null)[], uang: number[] = []) => {
    const row = ws.getRow(baris);
    nilai.forEach((v, i) => {
      const sel = row.getCell(i + 1);
      sel.value = v;
      sel.border = tepi;
      sel.alignment = { vertical: "middle", wrapText: i === 3 || i === 4 };
      if (uang.includes(i)) sel.numFmt = RP;
    });
  };

  const total = (
    ws: import("exceljs").Worksheet,
    baris: number,
    lebar: number,
    label: string,
    entries: { kolom: number; nilai: string | number | null; uang?: boolean }[],
  ) => {
    const row = ws.getRow(baris);
    row.getCell(1).value = label;
    for (const e of entries) {
      const sel = row.getCell(e.kolom);
      sel.value = e.nilai;
      if (e.uang) sel.numFmt = RP;
    }
    for (let i = 1; i <= lebar; i++) {
      const sel = row.getCell(i);
      sel.font = { bold: true };
      sel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ABU } };
      sel.border = tepi;
    }
  };

  const semuaBulan = [...new Set(txs.map(bulanDari))].sort();
  const tanggal = txs.map((t) => t.tanggal).sort();
  const periode = tanggal.length ? `${tanggal[0]} s/d ${tanggal[tanggal.length - 1]}` : "-";
  const keseluruhan = ringkas(txs);

  const wsRingkas = wb.addWorksheet("Ringkasan", { views: [{ state: "frozen", ySplit: 5 }] });
  wsRingkas.columns = [
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 14 },
  ];
  judul(wsRingkas, "Rekap Transaksi Keuangan", 7);
  wsRingkas.mergeCells(3, 1, 3, 7);
  wsRingkas.getCell(3, 1).value = `Periode: ${periode} · ${keseluruhan.jumlah} transaksi berlaku · ${keseluruhan.batal} dibatalkan`;
  wsRingkas.getCell(3, 1).font = { size: 11, color: { argb: "FF374151" } };
  kepala(wsRingkas, 5, ["Bulan", "Transaksi", "Pemasukan", "Pengeluaran", "Biaya admin", "Saldo bersih", "Dibatalkan"]);

  let r = 6;
  for (const bulan of semuaBulan) {
    const isiBulan = txs.filter((t) => bulanDari(t) === bulan);
    const s = ringkas(isiBulan);
    isi(wsRingkas, r, [labelBulan(bulan), s.jumlah, s.masuk, s.keluar, s.admin, s.masuk - s.keluar - s.admin, s.batal], [2, 3, 4, 5]);
    r += 1;
  }
  wsRingkas.autoFilter = { from: { row: 5, column: 1 }, to: { row: Math.max(5, r - 1), column: 7 } };
  total(wsRingkas, r, 7, "TOTAL", [
    { kolom: 2, nilai: keseluruhan.jumlah },
    { kolom: 3, nilai: keseluruhan.masuk, uang: true },
    { kolom: 4, nilai: keseluruhan.keluar, uang: true },
    { kolom: 5, nilai: keseluruhan.admin, uang: true },
    { kolom: 6, nilai: keseluruhan.masuk - keseluruhan.keluar - keseluruhan.admin, uang: true },
    { kolom: 7, nilai: keseluruhan.batal },
  ]);

  const wsKategori = wb.addWorksheet("Per kategori", { views: [{ state: "frozen", ySplit: 5 }] });
  const kategori = new Map<string, number>();
  for (const t of txs) {
    if (t.status !== "berlaku" || t.tipe !== "out") continue;
    const nama = t.subPost ?? t.label ?? "(Tanpa pos)";
    kategori.set(nama, (kategori.get(nama) ?? 0) + t.nominal + t.biayaAdmin);
  }
  const kategoriUrut = [...kategori.entries()].sort((a, b) => b[1] - a[1]);
  wsKategori.columns = [{ width: 32 }, { width: 18 }, { width: 14 }];
  judul(wsKategori, "Pengeluaran per Kategori", 3);
  kepala(wsKategori, 5, ["Kategori", "Total pengeluaran", "Porsi"]);
  let k = 6;
  const totalKategori = kategoriUrut.reduce((n, [, v]) => n + v, 0);
  for (const [nama, nilai] of kategoriUrut) {
    isi(wsKategori, k, [nama, nilai, totalKategori ? nilai / totalKategori : 0], [1]);
    wsKategori.getCell(k, 3).numFmt = "0.0%";
    k += 1;
  }
  wsKategori.autoFilter = { from: { row: 5, column: 1 }, to: { row: Math.max(5, k - 1), column: 3 } };
  total(wsKategori, k, 3, "TOTAL", [
    { kolom: 2, nilai: totalKategori, uang: true },
    { kolom: 3, nilai: totalKategori ? 1 : 0 },
  ]);
  wsKategori.getCell(k, 3).numFmt = "0.0%";

  const detail = (bulan: string) => txs.filter((t) => bulanDari(t) === bulan && t.status === "berlaku").sort((a, b) => (a.tanggal === b.tanggal ? a.id - b.id : a.tanggal < b.tanggal ? -1 : 1));

  for (const bulan of semuaBulan) {
    const isiBulan = detail(bulan);
    const ws = wb.addWorksheet(`${BULAN[Number(bulan.slice(5, 7)) - 1] ?? bulan} ${bulan.slice(0, 4)}`, {
      views: [{ state: "frozen", ySplit: 5 }],
    });
    ws.columns = [{ width: 6 }, { width: 13 }, { width: 18 }, { width: 30 }, { width: 42 }, { width: 16 }, { width: 14 }, { width: 14 }, { width: 14 }];
    judul(ws, `Transaksi ${labelBulan(bulan)}`, 9);
    const s = ringkas(isiBulan);
    ws.mergeCells(3, 1, 3, 9);
    ws.getCell(3, 1).value = `Pemasukan ${rupiah(s.masuk)} · Pengeluaran ${rupiah(s.keluar)} · Biaya admin ${rupiah(s.admin)} · Saldo ${rupiah(s.masuk - s.keluar - s.admin)}`;
    ws.getCell(3, 1).font = { size: 11, color: { argb: "FF374151" } };
    kepala(ws, 5, ["No", "Tanggal", "Jenis", "Kategori / pos", "Catatan", "Nominal", "Biaya admin", "Wadah asal", "Wadah tujuan"]);

    let baris = 6;
    isiBulan.forEach((t, i) => {
      isi(ws, baris, [i + 1, keTanggal(t.tanggal), namaTipe[t.tipe] ?? t.tipe, t.subPost ?? "-", t.label ?? "-", t.nominal, t.biayaAdmin || null, t.wadahAsal ?? "-", t.wadahTujuan ?? "-"], [5, 6]);
      ws.getCell(baris, 2).numFmt = "dd-mm-yyyy";
      baris += 1;
    });
    if (!isiBulan.length) {
      ws.mergeCells(baris, 1, baris, 9);
      ws.getCell(baris, 1).value = "Tidak ada transaksi berlaku pada bulan ini.";
      ws.getCell(baris, 1).alignment = { horizontal: "center" };
      baris += 1;
    }
    ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: Math.max(5, baris - 1), column: 9 } };
    total(ws, baris, 9, "Total pemasukan", [{ kolom: 6, nilai: s.masuk, uang: true }]);
    total(ws, baris + 1, 9, "Total pengeluaran", [{ kolom: 6, nilai: s.keluar, uang: true }]);
    total(ws, baris + 2, 9, "Total biaya admin", [{ kolom: 7, nilai: s.admin, uang: true }]);
    total(ws, baris + 3, 9, "Saldo bulan", [{ kolom: 6, nilai: s.masuk - s.keluar - s.admin, uang: true }]);
  }

  const batal = txs.filter((t) => t.status === "batal").sort((a, b) => (a.tanggal === b.tanggal ? a.id - b.id : a.tanggal < b.tanggal ? -1 : 1));
  const wsBatal = wb.addWorksheet("Dibatalkan", { views: [{ state: "frozen", ySplit: 5 }] });
  wsBatal.columns = [{ width: 6 }, { width: 13 }, { width: 16 }, { width: 18 }, { width: 30 }, { width: 42 }, { width: 16 }, { width: 14 }];
  judul(wsBatal, "Transaksi Dibatalkan", 8);
  kepala(wsBatal, 5, ["No", "Tanggal", "Bulan", "Jenis", "Kategori / pos", "Catatan", "Nominal", "Biaya admin"]);
  batal.forEach((t, i) => {
    isi(wsBatal, 6 + i, [i + 1, keTanggal(t.tanggal), labelBulan(bulanDari(t)), namaTipe[t.tipe] ?? t.tipe, t.subPost ?? "-", t.label ?? "-", t.nominal, t.biayaAdmin || null], [6, 7]);
    wsBatal.getCell(6 + i, 2).numFmt = "dd-mm-yyyy";
  });
  if (!batal.length) {
    wsBatal.mergeCells(6, 1, 6, 8);
    wsBatal.getCell(6, 1).value = "Tidak ada transaksi dibatalkan.";
    wsBatal.getCell(6, 1).alignment = { horizontal: "center" };
  }

  return wb;
}

export async function unduhXlsx(txs: TxView[], namaTipe: Record<string, string>) {
  const wb = await buatXlsx(txs, namaTipe);
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const tautan = document.createElement("a");
  tautan.href = url;
  tautan.download = "money-charger-rekap-transaksi.xlsx";
  tautan.click();
  URL.revokeObjectURL(url);
}
