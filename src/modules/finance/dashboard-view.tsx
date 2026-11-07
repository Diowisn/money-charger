"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import { Tombol } from "@/components/tombol";
import type { DashboardData, TxView } from "@/lib/dashboard";
import { unduhXlsx } from "@/lib/xlsx";

type Pesan = { jenis: "ok" | "error"; teks: string };
type Konfirmasi = { teks: string; judul: string; selesai: (nilai: boolean) => void };
type HasilScan = {
  nominal: number;
  subPos: string | null;
  tanggal: string | null;
  label: string | null;
  toko: string | null;
  alamat: string | null;
  kontak: string | null;
  konsumen: string | null;
  kasir: string | null;
  kategori: string | null;
  pajak: number | null;
  dibayar: number | null;
  kembalian: number | null;
};
type Tab =
  | "ringkasan"
  | "rencana"
  | "catat"
  | "riwayat"
  | "rekap"
  | "profil"
  | "ubah-profil"
  | "pos"
  | "piutang"
  | "target"
  | "asisten";
type StatusLive = "hidup" | "terputus";

const INTERVAL_LIVE_MS = 5000;

const NAMA_TIPE: Record<string, string> = {
  out: "Pengeluaran",
  in: "Pemasukan",
  gaji: "Gaji",
  bonus: "Bonus",
  tarik: "Tarik",
  pindah: "Pindah",
  selisih_gaji: "Selisih gaji",
  tambahan_jatah: "Tambahan jatah",
  alokasi_gaji: "Alokasi gaji",
  geser: "Geser jatah",
};

const rp = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;
const rpOpsional = (n: number | null) => (n === null ? "—" : rp(n));

const LABEL_DETAIL: Record<string, string> = {
  merchant: "Merchant",
  lokasi: "Lokasi",
  kontak: "Kontak",
  konsumen: "Konsumen",
  kasir: "Kasir",
  jenisTransaksi: "Jenis transaksi",
  rrn: "RRN",
  terminal: "Terminal",
  noTransaksi: "No. transaksi",
  referensi: "Referensi",
  nominal: "Nominal",
  biayaAdmin: "Biaya admin",
  total: "Total",
  pajak: "Pajak",
  dibayar: "Dibayar",
  kembalian: "Kembalian",
  toko: "Toko",
  alamat: "Alamat",
  kategori: "Kategori",
};

const KUNCI_UANG_DETAIL = new Set(["nominal", "biayaAdmin", "total", "pajak", "dibayar", "kembalian"]);

function BarisInfo({ label, nilai }: { label: string; nilai: ReactNode }) {
  return (
    <div className="baris-info">
      <dt>{label}</dt>
      <dd>{nilai ?? "—"}</dd>
    </div>
  );
}

function IkonRingkasan({ aktif }: { aktif: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={aktif ? 2.4 : 1.8}>
      <rect x="3" y="12" width="4" height="8" />
      <rect x="10" y="7" width="4" height="13" />
      <rect x="17" y="3" width="4" height="17" />
    </svg>
  );
}

function IkonRencana({ aktif }: { aktif: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={aktif ? 2.4 : 1.8}>
      <path d="M4 6h16M4 12h10M4 18h7" strokeLinecap="round" />
    </svg>
  );
}

function IkonTransaksi({ aktif }: { aktif: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={aktif ? 2.4 : 1.8}>
      <path d="M12 3v18M7 7l5-4 5 4M7 17l5 4 5-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IkonTambah({ aktif }: { aktif: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={aktif ? 2.5 : 2}>
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

function IkonPos({ aktif }: { aktif: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={aktif ? 2.4 : 1.8}>
      <rect x="4" y="7" width="16" height="13" rx="2" />
      <path d="M8 7V5a4 4 0 0 1 8 0v2" />
    </svg>
  );
}

function IkonPiutang({ aktif }: { aktif: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={aktif ? 2.4 : 1.8}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 0 1 5 0c0 2-2.5 2.5-2.5 4.5M12 17v.5" strokeLinecap="round" />
    </svg>
  );
}

function IkonTarget({ aktif }: { aktif: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={aktif ? 2.4 : 1.8}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IkonAsisten({ aktif }: { aktif: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={aktif ? 2.4 : 1.8}>
      <path d="M4 5h16v11H9l-5 4V5z" strokeLinejoin="round" />
      <path d="M8.5 10h.01M12 10h.01M15.5 10h.01" strokeLinecap="round" strokeWidth={2.2} />
    </svg>
  );
}

function IkonRekap({ aktif }: { aktif: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={aktif ? 2.4 : 1.8}>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" strokeLinecap="round" />
    </svg>
  );
}

function IkonProfil({ aktif }: { aktif: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={aktif ? 2.4 : 1.8}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" strokeLinecap="round" />
    </svg>
  );
}

function IkonKunci({ aktif }: { aktif: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={aktif ? 2.4 : 1.8}>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" strokeLinecap="round" />
      <circle cx="12" cy="15.5" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IkonPanah() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IkonMata({ buka }: { buka: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2.6" />
      {buka ? <path d="M4 20 20 4" strokeLinecap="round" /> : null}
    </svg>
  );
}

function IkonHapus({ aktif }: { aktif: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={aktif ? 2.4 : 1.8}>
      <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 11v5M14 11v5" strokeLinecap="round" />
    </svg>
  );
}

function IkonMasuk({ aktif }: { aktif: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={aktif ? 2.4 : 1.8}>
      <path d="M12 3v12M7 10l5 5 5-5M4 21h16" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IkonKeluar({ aktif }: { aktif: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={aktif ? 2.4 : 1.8}>
      <path d="M12 21V9M7 14l5-5 5 5M4 3h16" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const BULAN_PENDEK = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function tanggalPendek(iso: string) {
  const [tahun, bulan, hari] = iso.split("-").map(Number);
  if (!tahun || !bulan || !hari) return iso;
  return `${hari} ${BULAN_PENDEK[bulan - 1] ?? ""} ${tahun}`;
}

function formatMarkdown(teks: string) {
  return teks.split(/(\*\*[^*]+\*\*)/g).map((bagian, i) =>
    bagian.startsWith("**") && bagian.endsWith("**") ? <strong key={i}>{bagian.slice(2, -2)}</strong> : bagian,
  );
}

function labelBulan(kunci: string) {
  const [tahun, bulan] = kunci.split("-").map(Number);
  if (!tahun || !bulan) return kunci;
  return `${BULAN_PENDEK[bulan - 1] ?? ""} ${tahun}`;
}

function GrafikArea({ nilai, warna, label }: { nilai: number[]; warna: string; label: string }) {
  const id = useId().replace(/:/g, "");
  const w = 320;
  const h = 100;
  const pad = 10;
  const n = Math.max(1, nilai.length);
  const maks = Math.max(1, ...nilai);
  const titik = nilai.map((v, i) => {
    const x = n <= 1 ? w / 2 : (i / (n - 1)) * w;
    const y = h - pad - (v / maks) * (h - pad * 2);
    return [x, y] as const;
  });
  let garis = "";
  if (titik.length) {
    garis = `M ${titik[0][0]} ${titik[0][1]}`;
    for (let i = 0; i < titik.length - 1; i++) {
      const xTengah = (titik[i][0] + titik[i + 1][0]) / 2;
      garis += ` C ${xTengah} ${titik[i][1]}, ${xTengah} ${titik[i + 1][1]}, ${titik[i + 1][0]} ${titik[i + 1][1]}`;
    }
  }
  const area = `${garis} L ${w} ${h} L 0 ${h} Z`;
  const indeksPuncak = nilai.indexOf(maks);
  const puncak = titik[indeksPuncak] ?? [w / 2, h / 2];
  const adaData = nilai.some((v) => v > 0);

  return (
    <div className="grafik-area">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={label}>
        <defs>
          <linearGradient id={`grad-${id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={warna} stopOpacity="0.32" />
            <stop offset="100%" stopColor={warna} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#grad-${id})`} />
        <path
          d={garis}
          fill="none"
          stroke={warna}
          strokeWidth="2.2"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {adaData ? (
        <>
          <span
            className="grafik-titik"
            style={{ left: `${(puncak[0] / w) * 100}%`, top: `${(puncak[1] / h) * 100}%`, background: warna }}
          />
          <span
            className="grafik-pil"
            style={{
              left: `${Math.min(76, Math.max(20, (puncak[0] / w) * 100))}%`,
              top: `${Math.max(4, (puncak[1] / h) * 100 - 6)}%`,
              background: warna,
            }}
          >
            {rp(maks)}
          </span>
        </>
      ) : null}
    </div>
  );
}

const MENU_LAIN: [Tab, string, (p: { aktif: boolean }) => ReactElement][] = [
  ["pos", "Pos pengeluaran", IkonPos],
  ["piutang", "Piutang & utang", IkonPiutang],
  ["target", "Target tabungan", IkonTarget],
  ["asisten", "Asisten keuangan", IkonAsisten],
];

const MENU_SAMPING: [Tab, string, (p: { aktif: boolean }) => ReactElement][] = [
  ["ringkasan", "Beranda", IkonRingkasan],
  ["riwayat", "Transaksi", IkonTransaksi],
  ["rekap", "Rekap", IkonRekap],
  ["catat", "Catat transaksi", IkonTambah],
  ["rencana", "Rencana bulanan", IkonRencana],
  ...MENU_LAIN,
];

const MENU_IDENTITAS: [Tab, string, (p: { aktif: boolean }) => ReactElement][] = [
  ["profil", "Profil saya", IkonProfil],
  ["ubah-profil", "Edit profil", IkonProfil],
];

const TAB_IDENTITAS = new Set<Tab>(["profil", "ubah-profil"]);

const JUDUL_TAB: Record<Tab, string> = {
  ringkasan: "Beranda",
  rencana: "Rencana bulanan",
  catat: "Transaksi",
  riwayat: "Transaksi",
  rekap: "Rekap",
  profil: "Profil saya",
  "ubah-profil": "Edit profil",
  pos: "Pos pengeluaran",
  piutang: "Piutang & utang",
  target: "Target tabungan",
  asisten: "Asisten keuangan",
};

function drafRencana(data: DashboardData): Record<string, number> {
  const d: Record<string, number> = {
    dd: data.rencanaLain.dd,
    tabungan: data.rencanaLain.tabungan,
    investasi: data.rencanaLain.investasi,
  };
  for (const p of data.posSemua) if (p.aktif) d[`s:${p.id}`] = p.jatahRencana;
  return d;
}

type Tema = "terang" | "gelap";

function temaAwal(): Tema {
  if (typeof window === "undefined") return "terang";
  const simpanan = window.localStorage.getItem("mc_tema");
  if (simpanan === "terang" || simpanan === "gelap") return simpanan;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "gelap" : "terang";
}

export default function Dashboard({ awal }: { awal: DashboardData }) {
  const [data, setData] = useState(awal);
  const [tab, setTab] = useState<Tab>("ringkasan");
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<Pesan | null>(null);
  const [statusLive, setStatusLive] = useState<StatusLive>("hidup");
  const [terakhir, setTerakhir] = useState<number | null>(null);
  const [tema, setTema] = useState<Tema>("terang");
  const [nama, setNama] = useState(() => awal.profil?.nama?.trim() || awal.profil?.email.split("@")[0] || "");
  const [tipeCatat, setTipeCatat] = useState<"in" | "out">("out");
  const [menuTambah, setMenuTambah] = useState(false);
  const [hasilScan, setHasilScan] = useState<HasilScan | null>(null);
  const [editScan, setEditScan] = useState(false);
  const [detailTx, setDetailTx] = useState<TxView | null>(null);
  const [scanSibuk, setScanSibuk] = useState(false);
  const [konfirmasi, setKonfirmasi] = useState<Konfirmasi | null>(null);
  const inputScanRef = useRef<HTMLInputElement>(null);
  const inputUploadRef = useRef<HTMLInputElement>(null);
  const dataRef = useRef(awal);
  const sibukRef = useRef(false);
  const urutanRef = useRef(0);

  useEffect(() => {
    dataRef.current = awal;
    setData(awal);
  }, [awal]);

  const muatUlang = useCallback(async (senyap = true, paksa = false) => {
    if (!paksa && sibukRef.current) return;
    const urutan = ++urutanRef.current;
    try {
      const res = await fetch(`/api/dashboard?_=${Date.now()}`, {
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        data?: DashboardData;
        error?: string;
      };
      if (urutan !== urutanRef.current) return;
      if (!res.ok || !j.ok || !j.data) {
        setStatusLive("terputus");
        if (!senyap) setPesan({ jenis: "error", teks: j.error ?? "Gagal memuat data." });
        return;
      }
      if (JSON.stringify(j.data) !== JSON.stringify(dataRef.current)) {
        dataRef.current = j.data;
        setData(j.data);
      }
      setTerakhir(Date.now());
      setStatusLive("hidup");
    } catch {
      if (urutan !== urutanRef.current) return;
      setStatusLive("terputus");
      if (!senyap) setPesan({ jenis: "error", teks: "Tidak bisa menghubungi server." });
    }
  }, []);

  useEffect(() => {
    void muatUlang(true);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void muatUlang(true);
    }, INTERVAL_LIVE_MS);
    const saatTerlihat = () => {
      if (document.visibilityState === "visible") void muatUlang(true);
    };
    const saatFokus = () => void muatUlang(true);
    const saatOnline = () => void muatUlang(true);
    document.addEventListener("visibilitychange", saatTerlihat);
    window.addEventListener("focus", saatFokus);
    window.addEventListener("online", saatOnline);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", saatTerlihat);
      window.removeEventListener("focus", saatFokus);
      window.removeEventListener("online", saatOnline);
    };
  }, [muatUlang]);

  async function kirim(url: string, method: string, body?: unknown): Promise<boolean> {
    sibukRef.current = true;
    setSibuk(true);
    setPesan(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return false;
      }
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; pesan?: string };
      if (!res.ok || !j.ok) {
        setPesan({ jenis: "error", teks: j.error ?? "Gagal menyimpan." });
        return false;
      }
      await muatUlang(true, true);
      setPesan({ jenis: "ok", teks: j.pesan ?? "Tersimpan." });
      return true;
    } catch {
      setPesan({ jenis: "error", teks: "Tidak bisa menghubungi server." });
      return false;
    } finally {
      sibukRef.current = false;
      setSibuk(false);
    }
  }

  useEffect(() => {
    setTema(temaAwal());
  }, []);

  useEffect(() => {
    setNama(data.profil?.nama?.trim() || data.profil?.email.split("@")[0] || "");
  }, [data.profil?.nama, data.profil?.email]);

  useEffect(() => {
    document.documentElement.dataset.theme = tema === "gelap" ? "dark" : "light";
    window.localStorage.setItem("mc_tema", tema);
  }, [tema]);

  async function keluar() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  function mintaKonfirmasi(judul: string, teks: string): Promise<boolean> {
    return new Promise((selesai) => setKonfirmasi({ judul, teks, selesai }));
  }

  async function keluarSemua() {
    if (!(await mintaKonfirmasi("Keluar semua perangkat", "Semua sesi dashboard akan dicabut, termasuk sesi perangkat ini."))) return;
    const res = await fetch("/api/auth/logout-all", { method: "POST" });
    if (res.ok) window.location.href = "/login";
    else setPesan({ jenis: "error", teks: "Gagal mencabut semua sesi." });
  }

  function navigasiKe(tujuan: Tab) {
    setTab(tujuan);
    window.scrollTo(0, 0);
  }

  function catat(tipe: "in" | "out") {
    setTipeCatat(tipe);
    navigasiKe("catat");
  }

  async function scanStruk(file: File | undefined) {
    if (!file) return;
    setScanSibuk(true);
    setPesan(null);
    try {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch("/api/receipt", { method: "POST", body: form });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; data?: HasilScan };
      if (!res.ok || !j.ok || !j.data) throw new Error(j.error ?? "Gagal membaca struk.");
      setEditScan(false);
      setHasilScan(j.data);
    } catch (error) {
      setPesan({ jenis: "error", teks: error instanceof Error ? error.message : "Gagal membaca struk." });
    } finally {
      setScanSibuk(false);
    }
  }

  async function simpanHasilScan() {
    if (!hasilScan) return;
    const pos = data.posSemua.find((item) => item.aktif && item.nama === hasilScan.subPos);
    const berhasil = await kirim("/api/transactions", "POST", {
      tipe: "out",
      nominal: hasilScan.nominal,
      tanggal: hasilScan.tanggal ?? new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }),
      label: hasilScan.toko ?? hasilScan.label,
      subPostId: pos?.id ?? null,
      biayaAdmin: 0,
      detail: {
        toko: hasilScan.toko,
        alamat: hasilScan.alamat,
        kontak: hasilScan.kontak,
        konsumen: hasilScan.konsumen,
        kasir: hasilScan.kasir,
        kategori: hasilScan.kategori,
        pajak: hasilScan.pajak,
        dibayar: hasilScan.dibayar,
        kembalian: hasilScan.kembalian,
      },
    });
    if (berhasil) {
      setHasilScan(null);
      setEditScan(false);
    }
  }

  const jamTerakhir = terakhir
    ? new Date(terakhir).toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : null;
  const detailEntries = detailTx
    ? Object.entries(detailTx.detail ?? {}).filter(([, nilai]) => nilai !== null && nilai !== "")
    : [];
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-merek">
          <img src="/icon-192.png" alt="" width={42} height={42} />
          <div>
            <b>Money-Charger</b>
            <span>Keuangan pribadi</span>
          </div>
        </div>
        <Tombol className="sidebar-cat-button" lebar onClick={() => catat("out")}>
          <span aria-hidden="true">＋</span> Catat transaksi
        </Tombol>
        <nav className="sidebar-nav" aria-label="Navigasi utama">
          <p className="sidebar-label">MENU</p>
          {MENU_SAMPING.map(([id, label, Ikon]) => (
            <button
              key={id}
              type="button"
              className={tab === id ? "sidebar-link aktif" : "sidebar-link"}
              aria-current={tab === id ? "page" : undefined}
              onClick={() => navigasiKe(id)}
            >
              <Ikon aktif={tab === id} />
              <span>{label}</span>
            </button>
          ))}
          <p className="sidebar-label jarak">IDENTITAS DIRI</p>
          {MENU_IDENTITAS.map(([id, label, Ikon]) => (
            <button
              key={id}
              type="button"
              className={tab === id ? "sidebar-link aktif" : "sidebar-link"}
              aria-current={tab === id ? "page" : undefined}
              onClick={() => navigasiKe(id)}
            >
              <Ikon aktif={tab === id} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-status">
          <span className={`status-live ${statusLive}`} role="status" aria-live="polite">
            <i /> {statusLive === "hidup" ? "Tersinkron" : "Koneksi terputus"}
          </span>
          {jamTerakhir ? <span className="muted kecil">Pembaruan {jamTerakhir}</span> : null}
        </div>
      </aside>

      <div className="app-main">
        {tab !== "ringkasan" ? (
          <header className="app-header">
            <button
              className="header-back"
              type="button"
              onClick={() => navigasiKe(tab === "profil" ? "ringkasan" : TAB_IDENTITAS.has(tab) ? "profil" : "ringkasan")}
              aria-label={tab === "profil" ? "Kembali ke beranda" : TAB_IDENTITAS.has(tab) ? "Kembali ke identitas diri" : "Kembali ke beranda"}
            >
              ←
            </button>
            <h1>{JUDUL_TAB[tab]}</h1>
            <button
              className="header-avatar"
              type="button"
              onClick={() => navigasiKe("profil")}
              aria-label="Buka profil"
            >
              {data.profil?.avatar ? (
                <img src={data.profil.avatar} alt="" />
              ) : (
                (nama.trim().charAt(0) || "M").toUpperCase()
              )}
            </button>
          </header>
        ) : null}

        {pesan ? (
          <div className={`toast ${pesan.jenis}`} role="status">
            <span>{pesan.teks}</span>
            <button type="button" onClick={() => setPesan(null)} aria-label="Tutup">
              ×
            </button>
          </div>
        ) : null}

        {hasilScan ? (
          <div className="scan-overlay" role="presentation">
            <section className="scan-dialog scan-result" role="dialog" aria-modal="true" aria-labelledby="scan-title">
              <h2 id="scan-title" className="scan-result-title">Scan Result</h2>
              <div className="scan-preview">
                <p className="scan-preview-label"><span aria-hidden="true" /> Preview</p>
                {editScan ? (
                  <div className="scan-form">
                    <label>Toko
                      <input type="text" maxLength={80} value={hasilScan.toko ?? ""} onChange={(event) => setHasilScan({ ...hasilScan, toko: event.target.value || null })} />
                    </label>
                    <label>Alamat
                      <input type="text" maxLength={120} value={hasilScan.alamat ?? ""} onChange={(event) => setHasilScan({ ...hasilScan, alamat: event.target.value || null })} />
                    </label>
                    <label>Kontak
                      <input type="text" maxLength={40} value={hasilScan.kontak ?? ""} onChange={(event) => setHasilScan({ ...hasilScan, kontak: event.target.value || null })} />
                    </label>
                    <label>Konsumen
                      <input type="text" maxLength={80} value={hasilScan.konsumen ?? ""} onChange={(event) => setHasilScan({ ...hasilScan, konsumen: event.target.value || null })} />
                    </label>
                    <label>Tanggal
                      <input type="date" value={hasilScan.tanggal ?? data.hariIni} onChange={(event) => setHasilScan({ ...hasilScan, tanggal: event.target.value || null })} />
                    </label>
                    <label>Kasir
                      <input type="text" maxLength={60} value={hasilScan.kasir ?? ""} onChange={(event) => setHasilScan({ ...hasilScan, kasir: event.target.value || null })} />
                    </label>
                  </div>
                ) : (
                  <dl className="daftar-info">
                    <BarisInfo label="Toko" nilai={hasilScan.toko ?? hasilScan.label} />
                    <BarisInfo label="Alamat" nilai={hasilScan.alamat} />
                    <BarisInfo label="Kontak" nilai={hasilScan.kontak} />
                    <BarisInfo label="Konsumen" nilai={hasilScan.konsumen} />
                    <BarisInfo label="Tanggal" nilai={tanggalPendek(hasilScan.tanggal ?? data.hariIni)} />
                    <BarisInfo label="Kasir" nilai={hasilScan.kasir} />
                  </dl>
                )}
              </div>

              <div className="scan-divider" />

              {editScan ? (
                <div className="scan-form">
                  <label>Total biaya
                    <input type="number" min="1" step="1" inputMode="numeric" value={hasilScan.nominal} onChange={(event) => setHasilScan({ ...hasilScan, nominal: Number(event.target.value) })} />
                  </label>
                  <label>Pajak
                    <input type="number" min="0" step="1" inputMode="numeric" value={hasilScan.pajak ?? ""} onChange={(event) => setHasilScan({ ...hasilScan, pajak: event.target.value === "" ? null : Number(event.target.value) })} />
                  </label>
                  <label>Dibayar
                    <input type="number" min="0" step="1" inputMode="numeric" value={hasilScan.dibayar ?? ""} onChange={(event) => setHasilScan({ ...hasilScan, dibayar: event.target.value === "" ? null : Number(event.target.value) })} />
                  </label>
                  <label>Kembalian
                    <input type="number" min="0" step="1" inputMode="numeric" value={hasilScan.kembalian ?? ""} onChange={(event) => setHasilScan({ ...hasilScan, kembalian: event.target.value === "" ? null : Number(event.target.value) })} />
                  </label>
                  <label>Kategori
                    <select value={hasilScan.subPos ?? ""} onChange={(event) => setHasilScan({ ...hasilScan, subPos: event.target.value || null })}>
                      <option value="">Belum dipetakan</option>
                      {data.posSemua.filter((pos) => pos.aktif).map((pos) => <option key={pos.id} value={pos.nama}>{pos.nama}</option>)}
                    </select>
                  </label>
                </div>
              ) : (
                <dl className="daftar-info">
                  <BarisInfo label="Total Biaya" nilai={<b>{rp(hasilScan.nominal)}</b>} />
                  <BarisInfo label="Pajak" nilai={rpOpsional(hasilScan.pajak)} />
                  <BarisInfo label="Dibayar" nilai={rpOpsional(hasilScan.dibayar)} />
                  <BarisInfo label="Kembalian" nilai={rpOpsional(hasilScan.kembalian)} />
                  <BarisInfo label="Kategori" nilai={hasilScan.subPos ?? hasilScan.kategori} />
                </dl>
              )}

              <div className="scan-actions">
                {editScan ? (
                  <Tombol varian="sekunder" onClick={() => setEditScan(false)}>Batal</Tombol>
                ) : (
                  <Tombol varian="sekunder" onClick={() => setEditScan(true)}>Edit</Tombol>
                )}
                <Tombol disabled={sibuk || hasilScan.nominal < 1} onClick={() => void simpanHasilScan()}>
                  Simpan
                </Tombol>
              </div>
            </section>
          </div>
        ) : null}
        {scanSibuk ? <div className="toast" role="status">Membaca struk…</div> : null}
        {konfirmasi ? (
          <div className="dialog-overlay" onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              konfirmasi.selesai(false);
              setKonfirmasi(null);
            }
          }}>
            <section className="dialog-kartu" role="alertdialog" aria-modal="true" aria-labelledby="konfirmasi-judul">
              <h2 id="konfirmasi-judul">{konfirmasi.judul}</h2>
              <p>{konfirmasi.teks}</p>
              <div className="dialog-aksi">
                <Tombol varian="sekunder" onClick={() => { konfirmasi.selesai(false); setKonfirmasi(null); }}>
                  Batal
                </Tombol>
                <Tombol varian="bahaya" onClick={() => { konfirmasi.selesai(true); setKonfirmasi(null); }}>
                  Ya, lanjutkan
                </Tombol>
              </div>
            </section>
          </div>
        ) : null}

        {detailTx ? (
          <div
            className="dialog-overlay"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setDetailTx(null);
            }}
          >
            <section className="dialog-kartu detail-kartu" role="dialog" aria-modal="true" aria-labelledby="detail-judul">
              <div className="detail-kepala">
                <h2 id="detail-judul">{detailTx.subPost ?? detailTx.label ?? NAMA_TIPE[detailTx.tipe] ?? "Transaksi"}</h2>
                <span className="badge">{NAMA_TIPE[detailTx.tipe] ?? detailTx.tipe}</span>
              </div>
              <dl className="daftar-info">
                <BarisInfo label="Tanggal" nilai={tanggalPendek(detailTx.tanggal)} />
                <BarisInfo label="Nominal" nilai={rp(detailTx.nominal)} />
                {detailTx.biayaAdmin > 0 ? <BarisInfo label="Biaya admin" nilai={rp(detailTx.biayaAdmin)} /> : null}
                <BarisInfo
                  label="Total"
                  nilai={<b>{rp(detailTx.tipe === "out" ? detailTx.nominal + detailTx.biayaAdmin : detailTx.nominal)}</b>}
                />
                <BarisInfo label="Pos" nilai={detailTx.subPost} />
                <BarisInfo label="Catatan" nilai={detailTx.label} />
                {detailTx.wadahAsal ? <BarisInfo label="Wadah asal" nilai={detailTx.wadahAsal} /> : null}
                {detailTx.wadahTujuan ? <BarisInfo label="Wadah tujuan" nilai={detailTx.wadahTujuan} /> : null}
                <BarisInfo label="Status" nilai={detailTx.status === "batal" ? "Dibatalkan" : "Berlaku"} />
              </dl>
              {detailEntries.length ? (
                <>
                  <p className="detail-subjudul">Detail sumber</p>
                  <dl className="daftar-info">
                    {detailEntries.map(([kunci, nilai]) => (
                      <BarisInfo
                        key={kunci}
                        label={LABEL_DETAIL[kunci] ?? kunci}
                        nilai={KUNCI_UANG_DETAIL.has(kunci) && typeof nilai === "number" ? rp(nilai) : String(nilai)}
                      />
                    ))}
                  </dl>
                </>
              ) : null}
              <div className="dialog-aksi">
                <Tombol varian="sekunder" onClick={() => setDetailTx(null)}>Tutup</Tombol>
              </div>
            </section>
          </div>
        ) : null}

        <main className="konten">
          {tab === "ringkasan" ? (
            <Ringkasan data={data} nama={nama} navigasi={navigasiKe} catat={catat} />
          ) : null}
          {tab === "rencana" ? <Rencana data={data} kirim={kirim} sibuk={sibuk} /> : null}
          {tab === "catat" || tab === "riwayat" ? (
            <Transaksi
              data={data}
              kirim={kirim}
              sibuk={sibuk}
              mode={tab}
              tipeAwal={tipeCatat}
              navigasi={navigasiKe}
              mintaKonfirmasi={mintaKonfirmasi}
              bukaDetail={setDetailTx}
            />
          ) : null}
          {tab === "rekap" ? <Rekap data={data} navigasi={navigasiKe} /> : null}
          {tab === "profil" || tab === "ubah-profil" ? (
            <Profil
              bagian={tab}
              data={data}
              nama={nama}
              kirim={kirim}
              tema={tema}
              setTema={setTema}
              statusLive={statusLive}
              navigasi={navigasiKe}
              mintaKonfirmasi={mintaKonfirmasi}
              keluar={keluar}
              keluarSemua={keluarSemua}
            />
          ) : null}
          {tab === "pos" ? <Pos data={data} kirim={kirim} sibuk={sibuk} mintaKonfirmasi={mintaKonfirmasi} /> : null}
          {tab === "piutang" ? <Piutang data={data} kirim={kirim} sibuk={sibuk} mintaKonfirmasi={mintaKonfirmasi} /> : null}
          {tab === "target" ? <Target data={data} kirim={kirim} sibuk={sibuk} mintaKonfirmasi={mintaKonfirmasi} /> : null}
          {tab === "asisten" ? <Asisten /> : null}
        </main>

        <input
          ref={inputScanRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(event) => {
            void scanStruk(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <input
          ref={inputUploadRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            void scanStruk(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        {menuTambah ? (
          <div className="fab-menu" role="group" aria-label="Tambah">
            <Tombol varian="ghost" disabled={scanSibuk} onClick={() => { setMenuTambah(false); inputScanRef.current?.click(); }}>
              Scan struk
            </Tombol>
            <Tombol varian="ghost" disabled={scanSibuk} onClick={() => { setMenuTambah(false); inputUploadRef.current?.click(); }}>
              Upload struk
            </Tombol>
            <Tombol varian="ghost" onClick={() => { setMenuTambah(false); catat("out"); }}>
              Transaksi
            </Tombol>
          </div>
        ) : null}
        <button
          type="button"
          className="fab-catat"
          onClick={() => setMenuTambah((buka) => !buka)}
          aria-label={menuTambah ? "Tutup menu tambah" : "Tambah"}
          title="Tambah"
        >
          <IkonTambah aktif />
        </button>

        <nav className="bottom-nav" aria-label="Navigasi dashboard">
          {(
            [
              ["ringkasan", "Beranda", IkonRingkasan],
              ["riwayat", "Transaksi", IkonTransaksi],
              ["rekap", "Rekap", IkonRekap],
              ["profil", "Profil", IkonProfil],
            ] as [Tab, string, (p: { aktif: boolean }) => ReactElement][]
          ).map(([id, label, Ikon]) => (
            <button
              key={id}
              type="button"
              className={`nav-item${tab === id || (id === "profil" && TAB_IDENTITAS.has(tab)) ? " aktif" : ""}`}
              aria-current={tab === id || (id === "profil" && TAB_IDENTITAS.has(tab)) ? "page" : undefined}
              onClick={() => {
                navigasiKe(id);
              }}
            >
              <Ikon aktif={tab === id} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <footer className="kaki">
        <span>
          {statusLive === "hidup"
            ? `Tersinkron otomatis${jamTerakhir ? ` · ${jamTerakhir}` : ""}`
            : "Koneksi terputus · mencoba lagi..."}
        </span>
        <Tombol varian="tautan" onClick={() => void muatUlang(false)} disabled={sibuk}>
          Muat ulang
        </Tombol>
        </footer>
      </div>
    </div>
  );
}

function SaldoIlustrasi() {
  return (
    <svg className="saldo-ilustrasi" viewBox="0 0 132 96" aria-hidden="true">
      <rect x="8" y="40" width="76" height="44" rx="10" fill="rgba(255,255,255,0.18)" />
      <rect x="24" y="30" width="76" height="44" rx="10" fill="rgba(255,255,255,0.28)" />
      <rect x="40" y="20" width="76" height="44" rx="10" fill="rgba(255,255,255,0.9)" />
      <circle cx="96" cy="42" r="9" fill="#7fc8f3" />
      <path d="M96 37v10M92 40h8M92 44h8" stroke="#2b86bd" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="112" cy="70" r="11" fill="rgba(255,255,255,0.24)" />
      <circle cx="112" cy="70" r="6" fill="rgba(255,255,255,0.5)" />
      <path d="M18 82h168" stroke="rgba(255,255,255,0.16)" strokeLinecap="round" />
    </svg>
  );
}

function BarisTransaksi({ tx }: { tx: TxView }) {
  const keluar = tx.tipe === "out";
  const judul = tx.subPost ?? tx.label ?? NAMA_TIPE[tx.tipe] ?? tx.tipe;
  const nilai = keluar ? tx.nominal + tx.biayaAdmin : tx.nominal;
  return (
    <li className={tx.status === "batal" ? "item-transaksi batal" : "item-transaksi"}>
      <span className={keluar ? "avatar-uang" : "avatar-uang masuk"}>
        {judul.trim().charAt(0).toUpperCase() || "?"}
      </span>
      <div className="ringkas-info">
        <p className="ringkas-nama">{judul}</p>
        <p className="muted kecil">
          {tanggalPendek(tx.tanggal)} · {NAMA_TIPE[tx.tipe] ?? tx.tipe}
        </p>
      </div>
      <b className={keluar ? "ringkas-jumlah" : "ringkas-jumlah masuk"}>
        {keluar ? "−" : "+"} {rp(nilai)}
      </b>
    </li>
  );
}

function Ringkasan({
  data,
  nama,
  navigasi,
  catat,
}: {
  data: DashboardData;
  nama: string;
  navigasi: (tab: Tab) => void;
  catat: (tipe: "in" | "out") => void;
}) {
  const r = data.ringkasan;
  const terbaru = data.transaksi.filter((t) => t.status === "berlaku").slice(0, 6);

  return (
    <div className="beranda">
      <header className="beranda-sapaan">
        <div>
          <p className="sapaan-utama">Halo{nama ? `, ${nama}` : ""}!</p>
          <p className="sapaan-sub">Catat keuangan anda dengan mudah</p>
        </div>
        <button
          type="button"
          className="avatar-profil"
          onClick={() => navigasi("profil")}
          aria-label="Buka profil"
        >
          <img src={data.profil?.avatar || "/icon-192.png"} alt="" width={48} height={48} />
        </button>
      </header>

      <section className="saldo-kartu">
        <div className="saldo-teks">
          <p className="saldo-label">Total Saldo</p>
          <p className="saldo-angka">{rp(r.saldo)}</p>
          <p className="saldo-sub">
            {data.periode.aktif ? `Periode aktif · hari ke-${data.periode.hariKe}` : "Periode awal"}
          </p>
        </div>
        <SaldoIlustrasi />
      </section>

      <section className="aksi-cepat" aria-label="Aksi cepat">
        <button type="button" onClick={() => catat("in")}>
          <span className="aksi-ikon masuk">
            <IkonMasuk aktif={false} />
          </span>
          <span>Pemasukan</span>
        </button>
        <button type="button" onClick={() => catat("out")}>
          <span className="aksi-ikon keluar">
            <IkonKeluar aktif={false} />
          </span>
          <span>Pengeluaran</span>
        </button>
        <button type="button" onClick={() => navigasi("riwayat")}>
          <span className="aksi-ikon">
            <IkonTransaksi aktif={false} />
          </span>
          <span>Transaksi</span>
        </button>
        <button type="button" onClick={() => navigasi("rekap")}>
          <span className="aksi-ikon">
            <IkonRekap aktif={false} />
          </span>
          <span>Rekap</span>
        </button>
      </section>

      <section className="kartu transaksi-terakhir">
        <div className="baris-antara">
          <h2>Transaksi Terakhir</h2>
          <Tombol varian="tautan" onClick={() => navigasi("riwayat")}>
            Lihat semua
          </Tombol>
        </div>
        <ul className="daftar-transaksi daftar-rapi">
          {terbaru.map((t) => (
            <BarisTransaksi key={t.id} tx={t} />
          ))}
          {!terbaru.length ? (
            <li className="kosong">
              <p className="muted">Belum ada transaksi.</p>
              <Tombol varian="sekunder" onClick={() => catat("out")}>
                Catat sekarang
              </Tombol>
            </li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}

function mundurBulan(tahun: number, bulan: number, langkah: number) {
  let y = tahun;
  let m = bulan - langkah;
  while (m <= 0) {
    m += 12;
    y -= 1;
  }
  return `${y}-${String(m).padStart(2, "0")}`;
}

function Rekap({ data, navigasi }: { data: DashboardData; navigasi: (tab: Tab) => void }) {
  const r = data.ringkasan;
  const bulanIni = data.hariIni.slice(0, 7);
  const daftarBulan = useMemo(() => {
    const [tahun, bulan] = data.hariIni.split("-").map(Number);
    return Array.from({ length: 6 }, (_, i) => mundurBulan(tahun, bulan, 5 - i));
  }, [data.hariIni]);

  const agregat = useMemo(
    () =>
      daftarBulan.map((kunci) => {
        const isi = data.transaksi.filter(
          (t) => t.status === "berlaku" && t.tanggal.startsWith(kunci),
        );
        const masuk = isi
          .filter((t) => t.tipe === "in" || t.tipe === "gaji" || t.tipe === "bonus")
          .reduce((s, t) => s + t.nominal, 0);
        const keluar = isi
          .filter((t) => t.tipe === "out")
          .reduce((s, t) => s + t.nominal + t.biayaAdmin, 0);
        return {
          kunci,
          masuk: kunci === bulanIni ? r.pendapatanBulanIni : masuk,
          keluar: kunci === bulanIni ? r.pengeluaranBulanIni : keluar,
        };
      }),
    [daftarBulan, data.transaksi, bulanIni, r.pendapatanBulanIni, r.pengeluaranBulanIni],
  );

  const maks = Math.max(1, ...agregat.flatMap((a) => [a.masuk, a.keluar]));
  const bulanAktif = data.transaksi.filter(
    (t) => t.status === "berlaku" && t.tanggal.startsWith(bulanIni),
  );

  return (
    <div className="rekap">
      <section className="rekap-saldo">
        <p className="saldo-label">Saldo saat ini</p>
        <p className="saldo-angka">{rp(r.saldo)}</p>
      </section>

      <section className="rekap-total">
        <div className="rekap-total-kartu masuk">
          <p>Total Pemasukan</p>
          <b>{rp(r.pendapatanBulanIni)}</b>
        </div>
        <div className="rekap-total-kartu keluar">
          <p>Total Pengeluaran</p>
          <b>{rp(r.pengeluaranBulanIni)}</b>
        </div>
      </section>

      <section className="kartu rekap-grafik">
        <div className="baris-antara">
          <h2>Rekap 6 Bulan</h2>
          <span className="badge">Bulanan</span>
        </div>
        <div className="grafik-batang" role="img" aria-label="Grafik pemasukan dan pengeluaran 6 bulan">
          {agregat.map((a) => (
            <div className="batang-kolom" key={a.kunci}>
              <div className="batang-pasangan">
                <span
                  className="batang masuk"
                  style={{ height: `${Math.max(4, (a.masuk / maks) * 100)}%` }}
                  title={`Pemasukan ${labelBulan(a.kunci)}: ${rp(a.masuk)}`}
                />
                <span
                  className="batang keluar"
                  style={{ height: `${Math.max(4, (a.keluar / maks) * 100)}%` }}
                  title={`Pengeluaran ${labelBulan(a.kunci)}: ${rp(a.keluar)}`}
                />
              </div>
              <span className="batang-label">{BULAN_PENDEK[Number(a.kunci.slice(5)) - 1]}</span>
            </div>
          ))}
        </div>
        <div className="grafik-legenda">
          <span><i className="masuk" /> Pemasukan</span>
          <span><i className="keluar" /> Pengeluaran</span>
        </div>
      </section>

      <section className="kartu rekap-tren">
        <div className="baris-antara">
          <h2>Tren 14 Hari</h2>
          <span className="muted kecil">{rp(data.tren.reduce((s, t) => s + t.pengeluaran, 0))}</span>
        </div>
        <GrafikArea
          nilai={data.tren.map((t) => t.pengeluaran)}
          warna="var(--merah)"
          label="Grafik pengeluaran 14 hari terakhir"
        />
      </section>

      <section className="kartu rekap-terakhir">
        <div className="baris-antara">
          <h2>Rekap {labelBulan(bulanIni)}</h2>
          <Tombol varian="tautan" onClick={() => navigasi("riwayat")}>
            Lihat semua
          </Tombol>
        </div>
        <ul className="daftar-transaksi daftar-rapi">
          {bulanAktif.slice(0, 6).map((t) => (
            <BarisTransaksi key={t.id} tx={t} />
          ))}
          {!bulanAktif.length ? <li className="kosong">Belum ada transaksi bulan ini.</li> : null}
        </ul>
      </section>
    </div>
  );
}

async function fileKeAvatar(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Pilih foto JPG, PNG, atau WEBP.");
  if (file.size > 8 * 1024 * 1024) throw new Error("Ukuran foto maksimal 8 MB.");
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Gagal membaca foto."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error("Foto tidak bisa dibuka."));
    img.onload = () => resolve(img);
    img.src = dataUrl;
  });
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Browser tidak mendukung pengolahan foto.");
  const skala = Math.max(size / image.width, size / image.height);
  const lebar = image.width * skala;
  const tinggi = image.height * skala;
  ctx.drawImage(image, (size - lebar) / 2, (size - tinggi) / 2, lebar, tinggi);
  return canvas.toDataURL("image/jpeg", 0.82);
}

function Profil({
  bagian,
  data,
  nama,
  kirim,
  tema,
  setTema,
  statusLive,
  navigasi,
  mintaKonfirmasi,
  keluar,
  keluarSemua,
}: {
  bagian: Tab;
  data: DashboardData;
  nama: string;
  kirim: (url: string, method: string, body?: unknown) => Promise<boolean>;
  tema: Tema;
  setTema: (tema: Tema) => void;
  statusLive: StatusLive;
  navigasi: (tab: Tab) => void;
  mintaKonfirmasi: (judul: string, teks: string) => Promise<boolean>;
  keluar: () => Promise<void>;
  keluarSemua: () => Promise<void>;
}) {
  const profil = data.profil;
  const namaTampil = profil?.nama?.trim() || nama || "Pengguna Money-Charger";
  const [drafNama, setDrafNama] = useState(profil?.nama ?? nama);
  const [drafEmail, setDrafEmail] = useState(profil?.email ?? "");
  const [drafTelepon, setDrafTelepon] = useState(profil?.telepon ?? "");
  const [drafTanggalLahir, setDrafTanggalLahir] = useState(profil?.tanggalLahir ?? "");
  const [avatarDraf, setAvatarDraf] = useState<string | null | undefined>(undefined);
  const [avatarTampil, setAvatarTampil] = useState<string | null>(profil?.avatar ?? null);
  const [sibukProfil, setSibukProfil] = useState(false);
  const [galatProfil, setGalatProfil] = useState<string | null>(null);
  const [passwordLama, setPasswordLama] = useState("");
  const [passwordBaru, setPasswordBaru] = useState("");
  const [passwordUlang, setPasswordUlang] = useState("");
  const [emailHapus, setEmailHapus] = useState("");
  const [passwordHapus, setPasswordHapus] = useState("");
  const fotoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDrafNama(profil?.nama ?? nama);
    setDrafEmail(profil?.email ?? "");
    setDrafTelepon(profil?.telepon ?? "");
    setDrafTanggalLahir(profil?.tanggalLahir ?? "");
    setAvatarTampil(profil?.avatar ?? null);
    setAvatarDraf(undefined);
  }, [profil?.nama, profil?.email, profil?.telepon, profil?.tanggalLahir, profil?.avatar, nama]);

  async function pilihFoto(file: File | undefined) {
    if (!file) return;
    setGalatProfil(null);
    setSibukProfil(true);
    try {
      const hasil = await fileKeAvatar(file);
      setAvatarDraf(hasil);
      setAvatarTampil(hasil);
    } catch (error) {
      setGalatProfil(error instanceof Error ? error.message : "Gagal memproses foto.");
    } finally {
      setSibukProfil(false);
    }
  }

  async function simpanProfil() {
    const email = drafEmail.trim().toLowerCase();
    const namaBaru = drafNama.trim();
    if (!namaBaru) {
      setGalatProfil("Nama tidak boleh kosong.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setGalatProfil("Alamat email tidak valid.");
      return;
    }
    const gantiSandi = Boolean(passwordLama || passwordBaru || passwordUlang);
    if (gantiSandi) {
      if (profil?.punyaPassword && !passwordLama) {
        setGalatProfil("Masukkan password lama.");
        return;
      }
      if (passwordBaru.length < 12) {
        setGalatProfil("Password baru minimal 12 karakter.");
        return;
      }
      if (passwordBaru !== passwordUlang) {
        setGalatProfil("Konfirmasi password tidak sama.");
        return;
      }
    }
    setGalatProfil(null);
    setSibukProfil(true);
    const body: Record<string, unknown> = {
      nama: namaBaru,
      email,
      telepon: drafTelepon.trim(),
      tanggalLahir: drafTanggalLahir,
    };
    if (avatarDraf !== undefined) body.avatar = avatarDraf;
    if (gantiSandi) {
      body.currentPassword = passwordLama;
      body.newPassword = passwordBaru;
    }
    const berhasil = await kirim("/api/profile", "PATCH", body);
    if (berhasil) {
      setAvatarDraf(undefined);
      setPasswordLama("");
      setPasswordBaru("");
      setPasswordUlang("");
    }
    setSibukProfil(false);
  }

  async function hapusProfil() {
    if (!profil) return;
    if (emailHapus.trim().toLowerCase() !== profil.email.toLowerCase()) {
      setGalatProfil("Email konfirmasi tidak sama dengan email akun.");
      return;
    }
    if (profil.punyaPassword && !passwordHapus) {
      setGalatProfil("Masukkan password akun.");
      return;
    }
    const lanjut = await mintaKonfirmasi(
      "Hapus akun permanen?",
      "Seluruh transaksi, utang, target tabungan, pengaturan, dan data akun ini akan dihapus dan tidak bisa dikembalikan.",
    );
    if (!lanjut) return;
    setGalatProfil(null);
    setSibukProfil(true);
    try {
      const res = await fetch("/api/profile", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailHapus.trim(), password: passwordHapus }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setGalatProfil(j.error ?? "Gagal menghapus akun.");
        return;
      }
      window.location.href = "/login";
    } catch {
      setGalatProfil("Tidak bisa menghubungi server.");
    } finally {
      setSibukProfil(false);
    }
  }

  async function hapusCache() {
    if (!(await mintaKonfirmasi("Hapus cache?", "Data cache dan berkas offline akan dihapus, lalu halaman dimuat ulang."))) return;
    try {
      if ("caches" in window) {
        const kunci = await caches.keys();
        await Promise.all(kunci.map((k) => caches.delete(k)));
      }
    } catch {
      // Cache storage bisa diblokir; reload tetap dilakukan.
    }
    window.location.reload();
  }

  return (
    <div className="profil">
      {bagian === "profil" ? (
        <>
          <section className="profil-head">
            <span className="profil-avatar besar">
              <img src={avatarTampil || "/icon-192.png"} alt="" width={96} height={96} />
            </span>
            <h2>{namaTampil}</h2>
            <p className="muted">{profil?.email ?? "Memuat akun..."}</p>
            <span className={`status-live ${statusLive}`}>
              <i /> {statusLive === "hidup" ? "Tersinkron" : "Koneksi terputus"}
            </span>
            <Tombol varian="sekunder" onClick={() => navigasi("ubah-profil")}>
              Edit profil
            </Tombol>
          </section>

          <section className="profil-daftar">
            <button type="button" onClick={() => navigasi("ubah-profil")}>
              <IkonKunci aktif={false} />
              <span>{profil?.punyaPassword ? "Ubah password" : "Buat password"}</span>
              <IkonPanah />
            </button>
            <button type="button" onClick={() => void unduhXlsx(data.transaksi, NAMA_TIPE)}>
              <IkonRekap aktif={false} />
              <span>Cadangan (ekspor .xlsx)</span>
              <IkonPanah />
            </button>
            <button type="button" onClick={() => setTema(tema === "gelap" ? "terang" : "gelap")}>
              <IkonMata buka={tema === "gelap"} />
              <span>Tema {tema === "gelap" ? "gelap" : "terang"}</span>
              <IkonPanah />
            </button>
            <button type="button" onClick={() => void hapusCache()}>
              <IkonHapus aktif={false} />
              <span>Hapus cache</span>
              <IkonPanah />
            </button>
            <button type="button" className="keluar" onClick={() => void keluar()}>
              <IkonKeluar aktif={false} />
              <span>Log out</span>
              <IkonPanah />
            </button>
          </section>
        </>
      ) : null}

      {bagian === "ubah-profil" ? (
        <>
          <section className="profil-head">
            <span className="profil-avatar besar">
              <img src={avatarTampil || "/icon-192.png"} alt="" width={96} height={96} />
            </span>
            <button type="button" className="tautan" onClick={() => fotoRef.current?.click()} disabled={sibukProfil}>
              Ganti foto
            </button>
            {avatarTampil ? (
              <button type="button" className="tautan muted" onClick={() => { setAvatarDraf(null); setAvatarTampil(null); }}>
                Hapus foto
              </button>
            ) : null}
            <input
              ref={fotoRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={(event) => {
                void pilihFoto(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </section>

          <section className="kartu profil-bagian">
            <h2>Edit profil</h2>
            <div className="form">
              <label>
                Nama lengkap
                <input value={drafNama} onChange={(e) => setDrafNama(e.target.value)} placeholder="Nama kamu" maxLength={60} />
              </label>
              <label>
                Email
                <input type="email" value={drafEmail} onChange={(e) => setDrafEmail(e.target.value)} maxLength={254} />
              </label>
              <label>
                Nomor telepon
                <input type="tel" inputMode="tel" value={drafTelepon} onChange={(e) => setDrafTelepon(e.target.value)} maxLength={20} placeholder="08xxxxxxxxxx" />
              </label>
              <label>
                Tanggal lahir
                <input type="date" value={drafTanggalLahir} onChange={(e) => setDrafTanggalLahir(e.target.value)} />
              </label>
              <h3 className="profil-subjudul">{profil?.punyaPassword ? "Ganti password" : "Buat password"}</h3>
              <p className="muted kecil">Kosongkan bagian ini jika tidak ingin mengganti password. Minimal 12 karakter.</p>
              {profil?.punyaPassword ? (
                <label>
                  Password lama
                  <input type="password" autoComplete="current-password" value={passwordLama} onChange={(e) => setPasswordLama(e.target.value)} maxLength={1024} />
                </label>
              ) : null}
              <label>
                Password baru
                <input type="password" autoComplete="new-password" value={passwordBaru} onChange={(e) => setPasswordBaru(e.target.value)} minLength={12} maxLength={1024} />
              </label>
              <label>
                Ulangi password baru
                <input type="password" autoComplete="new-password" value={passwordUlang} onChange={(e) => setPasswordUlang(e.target.value)} minLength={12} maxLength={1024} />
              </label>
              {galatProfil ? <p className="error" role="alert">{galatProfil}</p> : null}
              <Tombol lebar ukuran="besar" onClick={() => void simpanProfil()} disabled={sibukProfil}>
                {sibukProfil ? "Menyimpan..." : "Update"}
              </Tombol>
            </div>
          </section>

          <section className="kartu profil-bagian">
            <h2>Perangkat &amp; sesi</h2>
            <p className="muted kecil">
              {profil?.providers.length ? `Terhubung: ${profil.providers.join(", ")}` : "Login email dan password"}
            </p>
            <Tombol varian="bahaya" lebar onClick={() => void keluarSemua()}>
              Log out dari semua perangkat
            </Tombol>
          </section>
        </>
      ) : null}

      {bagian === "ubah-profil" ? (
        <section className="kartu profil-bagian bahaya">
          <h2>Hapus akun</h2>
          <p className="muted kecil">
            Tindakan permanen. Semua data keuangan milik akun ini ikut terhapus.
          </p>
          <div className="form">
            <label>
              Ketik email akun
              <input type="email" value={emailHapus} onChange={(e) => setEmailHapus(e.target.value)} placeholder={profil?.email ?? ""} />
            </label>
            {profil?.punyaPassword ? (
              <label>
                Password
                <input type="password" autoComplete="current-password" value={passwordHapus} onChange={(e) => setPasswordHapus(e.target.value)} />
              </label>
            ) : null}
            {galatProfil ? <p className="error" role="alert">{galatProfil}</p> : null}
            <Tombol varian="bahaya" lebar onClick={() => void hapusProfil()} disabled={sibukProfil}>
              Hapus akun permanen
            </Tombol>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function JawabanRapi({ teks }: { teks: string }) {
  const isi = teks.replace(/\r\n?/g, "\n").trim();
  const blok = isi.split(/\n\s*\n/).filter(Boolean);
  const renderBaris = (baris: string, i: number) => {
    const teksBaris = baris.trim();
    if (/^\*\*[^*]+\*\*$/.test(teksBaris)) {
      return <h3 key={i}>{teksBaris.slice(2, -2)}</h3>;
    }
    const item = teksBaris.match(/^(?:[-*]\s+|\d+[.)]\s+)(.+)$/);
    if (!item) return <p key={i}>{formatMarkdown(teksBaris)}</p>;
    const nomor = baris.trim().match(/^(\d+)[.)]/)?.[1];
    return (
      <div className="jawaban-item" key={i}>
        <span>{nomor ?? "•"}</span>
        <p>{formatMarkdown(item[1])}</p>
      </div>
    );
  };

  return (
    <div className="jawaban-rapi">
      {blok.map((bagian, i) => {
        const baris = bagian.split("\n").filter((b) => b.trim());
        const daftar = baris.every((b) => /^(?:[-*]\s+|\d+[.)]\s+)/.test(b.trim()));
        return daftar ? (
          <div className="jawaban-daftar" key={i}>{baris.map(renderBaris)}</div>
        ) : (
          <div className="jawaban-blok" key={i}>{baris.map(renderBaris)}</div>
        );
      })}
    </div>
  );
}

type ChatPesan = { peran: "user" | "ai"; teks: string };

const SARAN_TANYA = [
  "Pos apa yang paling boros bulan ini?",
  "Bagaimana cara menabung lebih banyak?",
  "Ringkas kondisi keuanganku.",
  "Sisa uangku cukup sampai gaji berikutnya?",
];

function Asisten() {
  const [riwayat, setRiwayat] = useState<ChatPesan[]>([]);
  const [teks, setTeks] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const ujung = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ujung.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [riwayat, sibuk]);

  async function kirimTanya(pertanyaan: string) {
    const isi = pertanyaan.trim();
    if (!isi || sibuk) return;
    setGalat(null);
    setRiwayat((r) => [...r, { peran: "user", teks: isi }]);
    setTeks("");
    setSibuk(true);
    try {
      const res = await fetch("/api/insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pertanyaan: isi }),
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; jawaban?: string; error?: string };
      if (!res.ok || !j.ok || !j.jawaban) {
        setGalat(j.error ?? "Asisten gagal menjawab.");
        return;
      }
      setRiwayat((r) => [...r, { peran: "ai", teks: j.jawaban! }]);
    } catch {
      setGalat("Tidak bisa menghubungi server.");
    } finally {
      setSibuk(false);
    }
  }

  return (
    <div className="tumpuk sempit">
      <section className="kartu">
        <h2>Tanya Asisten</h2>
        <p className="muted">
          Jawaban memakai data keuangan di dashboard ini. Asisten tidak mengubah transaksi.
        </p>

        {riwayat.length === 0 ? (
          <div className="saran-chat">
            {SARAN_TANYA.map((s) => (
              <button key={s} type="button" className="chip" onClick={() => void kirimTanya(s)}>
                {s}
              </button>
            ))}
          </div>
        ) : null}

        <div className="chat" aria-live="polite">
          {riwayat.map((m, i) => (
            <div key={i} className={`chat-pesan ${m.peran}`}>
              {m.peran === "ai" ? <JawabanRapi teks={m.teks} /> : m.teks}
            </div>
          ))}
          {sibuk ? <div className="chat-pesan ai muted">Sedang membaca data...</div> : null}
          <div ref={ujung} />
        </div>

        {galat ? <p className="merah kecil">{galat}</p> : null}

        <form
          className="chat-form"
          onSubmit={(e) => {
            e.preventDefault();
            void kirimTanya(teks);
          }}
        >
          <input
            value={teks}
            onChange={(e) => setTeks(e.target.value)}
            placeholder="Tulis pertanyaan tentang keuanganmu..."
            maxLength={400}
            disabled={sibuk}
            aria-label="Pertanyaan untuk asisten"
          />
          <Tombol type="submit" disabled={sibuk || teks.trim().length < 3}>
            Kirim
          </Tombol>
        </form>
        <p className="muted kecil">
          {riwayat.length ? (
            <Tombol varian="tautan" onClick={() => setRiwayat([])}>
              Bersihkan percakapan
            </Tombol>
          ) : (
            "Butuh GROQ_API_KEY agar asisten aktif."
          )}
        </p>
      </section>
    </div>
  );
}

function Rencana({
  data,
  kirim,
  sibuk,
}: {
  data: DashboardData;
  kirim: (url: string, method: string, body?: unknown) => Promise<boolean>;
  sibuk: boolean;
}) {
  const [draf, setDraf] = useState<Record<string, number>>(() => drafRencana(data));
  const [sekarang, setSekarang] = useState(true);

  useEffect(() => {
    setDraf(drafRencana(data));
  }, [data.versiRencana]);

  const ubah = (key: string, v: number) => setDraf((d) => ({ ...d, [key]: Math.max(0, Math.round(v)) }));
  const total = useMemo(() => Object.values(draf).reduce((s, v) => s + v, 0), [draf]);

  async function simpan() {
    const items: { tipe: string; subPostId: number | null; nominal: number }[] = [];
    for (const p of data.posSemua) {
      if (!p.aktif) continue;
      items.push({ tipe: "sub_pos", subPostId: p.id, nominal: draf[`s:${p.id}`] ?? 0 });
    }
    items.push({ tipe: "dd", subPostId: null, nominal: draf.dd ?? 0 });
    items.push({ tipe: "tabungan", subPostId: null, nominal: draf.tabungan ?? 0 });
    items.push({ tipe: "investasi", subPostId: null, nominal: draf.investasi ?? 0 });
    await kirim("/api/plan", "POST", { items, sekarang });
  }

  return (
    <div className="tumpuk rencana-grid">
      <section className="kartu">
        <div className="baris-antara">
          <div>
            <p className="label">Total Rencana</p>
            <p className="angka-besar">{rp(total)}</p>
          </div>
          <span className={total === data.pengaturan.gajiPokok ? "badge hijau" : "badge"}>
            Gaji pokok {rp(data.pengaturan.gajiPokok)}
          </span>
        </div>
        <p className="muted">
          Geser jatah tiap pos. Perubahan disimpan sebagai versi rencana baru, versi lama tetap tersimpan.
        </p>
      </section>

      {data.grup.map((g) => (
        <section className="kartu grup-rencana" key={g.id}>
          <div className="baris-antara">
            <h2>{g.nama}</h2>
            <span className="muted">
              {rp(g.pos.reduce((s, p) => s + (draf[`s:${p.id}`] ?? 0), 0))}
            </span>
          </div>
          {g.pos.map((p) => {
            const key = `s:${p.id}`;
            const v = draf[key] ?? 0;
            const maks = Math.max(1_000_000, Math.ceil((Math.max(v, p.jatahRencana) * 2) / 100000) * 100000);
            return (
              <div className="slider" key={p.id}>
                <div className="baris-antara">
                  <span>{p.nama}</span>
                  <input
                    className="angka-input"
                    type="number"
                    min={0}
                    step={10000}
                    value={v}
                    onChange={(e) => ubah(key, Number(e.target.value))}
                  />
                </div>
                <input
                  type="range"
                  min={0}
                  max={maks}
                  step={10000}
                  value={Math.min(v, maks)}
                  onChange={(e) => ubah(key, Number(e.target.value))}
                />
                <div className="baris-antara kecil muted">
                  <span>Sekarang {rp(p.jatahRencana)}</span>
                  <span>Terpakai {rp(p.terpakai)}</span>
                </div>
              </div>
            );
          })}
        </section>
      ))}

      <section className="kartu">
        <h2>Pos di luar grup</h2>
        {(
          [
            ["dd", "Dana Darurat"],
            ["tabungan", "Tabungan"],
            ["investasi", "Investasi"],
          ] as const
        ).map(([key, label]) => (
          <div className="slider" key={key}>
            <div className="baris-antara">
              <span>{label}</span>
              <input
                className="angka-input"
                type="number"
                min={0}
                step={10000}
                value={draf[key] ?? 0}
                onChange={(e) => ubah(key, Number(e.target.value))}
              />
            </div>
          </div>
        ))}
        <p className="muted kecil">
          Tabungan dan Investasi hanya bisa diubah mulai periode berikutnya. Untuk memindahkan sekarang, pakai tab
          Transaksi.
        </p>
      </section>

      <section className="kartu aksi-bawah">
        <label className="cek">
          <input type="checkbox" checked={sekarang} onChange={(e) => setSekarang(e.target.checked)} />
          <span>Berlaku juga di periode berjalan (selisih masuk/keluar Saldo)</span>
        </label>
        <div className="baris-tombol">
          <Tombol varian="sekunder" onClick={() => setDraf(drafRencana(data))} disabled={sibuk}>
            Reset
          </Tombol>
          <Tombol onClick={() => void simpan()} disabled={sibuk}>
            {sibuk ? "Menyimpan..." : "Simpan rencana"}
          </Tombol>
        </div>
      </section>
    </div>
  );
}

function Transaksi({
  data,
  kirim,
  sibuk,
  mode,
  tipeAwal,
  navigasi,
  mintaKonfirmasi,
  bukaDetail,
}: {
  data: DashboardData;
  kirim: (url: string, method: string, body?: unknown) => Promise<boolean>;
  sibuk: boolean;
  mode: "catat" | "riwayat";
  tipeAwal: "in" | "out";
  navigasi: (tab: Tab) => void;
  mintaKonfirmasi: (judul: string, teks: string) => Promise<boolean>;
  bukaDetail: (t: TxView) => void;
}) {
  const [tipe, setTipe] = useState<string>(tipeAwal);
  const [nominal, setNominal] = useState("");
  const [biayaAdminAktif, setBiayaAdminAktif] = useState(false);
  const [biayaAdmin, setBiayaAdmin] = useState("");
  const [tanggal, setTanggal] = useState(data.hariIni);
  const [label, setLabel] = useState("");
  const [subPostId, setSubPostId] = useState("");
  const [wadah, setWadah] = useState("saldo");
  const [wadahAsal, setWadahAsal] = useState("tabungan");
  const [wadahTujuan, setWadahTujuan] = useState("saldo");
  const [paksa, setPaksa] = useState(false);
  const [bulanFilter, setBulanFilter] = useState("semua");
  const [cari, setCari] = useState("");
  const [halaman, setHalaman] = useState(1);

  useEffect(() => {
    if (mode === "catat") setTipe(tipeAwal);
  }, [mode, tipeAwal]);

  const posAktif = data.posSemua.filter((p) => p.aktif);
  const PER_HALAMAN = 10;

  const daftarBulan = useMemo(
    () =>
      [...new Set(data.transaksi.map((t) => t.tanggal.slice(0, 7)))].sort((a, b) => (a < b ? 1 : -1)),
    [data.transaksi],
  );

  const tersaring = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return data.transaksi.filter((t) => {
      if (bulanFilter !== "semua" && !t.tanggal.startsWith(bulanFilter)) return false;
      if (!q) return true;
      const isi = `${t.subPost ?? ""} ${t.label ?? ""} ${t.tanggal} ${t.wadahTujuan ?? ""} ${t.wadahAsal ?? ""}`;
      return isi.toLowerCase().includes(q);
    });
  }, [data.transaksi, bulanFilter, cari]);

  const totalHalaman = Math.max(1, Math.ceil(tersaring.length / PER_HALAMAN));
  const halamanAman = Math.min(halaman, totalHalaman);
  const tampil = tersaring.slice((halamanAman - 1) * PER_HALAMAN, halamanAman * PER_HALAMAN);

  async function simpan() {
    const body: Record<string, unknown> = { tipe, nominal: Number(nominal), tanggal, label: label || null };
    if (tipe === "out") {
      body.subPostId = subPostId ? Number(subPostId) : null;
      body.biayaAdmin = biayaAdminAktif ? Number(biayaAdmin || 0) : 0;
    }
    if (tipe === "in") body.wadah = wadah;
    if (tipe === "bonus") body.wadah = wadah || null;
    if (tipe === "tarik") {
      body.wadahAsal = wadahAsal;
      body.wadahTujuan = "saldo";
    }
    if (tipe === "pindah") {
      body.wadahAsal = wadahAsal;
      body.wadahTujuan = wadahTujuan;
    }
    if (tipe === "gaji") body.paksa = paksa;
    const ok = await kirim("/api/transactions", "POST", body);
    if (ok) {
      setNominal("");
      setLabel("");
      setBiayaAdmin("");
      setBiayaAdminAktif(false);
    }
  }

  async function hapus(id: number, teks: string) {
    if (!(await mintaKonfirmasi("Batalkan transaksi?", `Batalkan ${teks}?`))) return;
    await kirim("/api/transactions", "DELETE", { id });
  }

  return (
    <div className={mode === "catat" ? "tumpuk layar-catat" : "tumpuk layar-riwayat"}>
      {mode === "catat" ? (
      <section className="kartu form-transaksi">
        <div className="section-title">
          <div>
            <p className="eyebrow">TRANSAKSI BARU</p>
            <h2>Catat transaksi</h2>
          </div>
          <span className="badge">{data.hariIni}</span>
        </div>
        <div className="form form-transaksi-grid">
          <fieldset className="segmented">
            <legend>Jenis transaksi</legend>
            {([
              ["out", "Pengeluaran"],
              ["in", "Pemasukan"],
              ["gaji", "Gaji"],
              ["bonus", "Bonus"],
              ["tarik", "Tarik"],
              ["pindah", "Pindah"],
            ] as [string, string][]).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={tipe === value ? "segmented-item aktif" : "segmented-item"}
                aria-pressed={tipe === value}
                onClick={() => setTipe(value)}
              >
                {label}
              </button>
            ))}
          </fieldset>

          <label>
            Nominal (Rp)
            <input
              type="number"
              min={1}
              step={1000}
              inputMode="numeric"
              value={nominal}
              onChange={(e) => setNominal(e.target.value)}
              placeholder="contoh 50000"
            />
          </label>

          <label>
            Tanggal
            <input type="date" max={data.hariIni} value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
          </label>

          <label>
            Catatan (opsional)
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="contoh makan siang" />
          </label>

          {tipe === "out" ? (
            <>
              <label>
                Pos (opsional)
                <select value={subPostId} onChange={(e) => setSubPostId(e.target.value)}>
                  <option value="">Belum dipetakan</option>
                  {posAktif.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.grup} · {p.nama}
                    </option>
                  ))}
                </select>
              </label>
              <label className="cek">
                <input
                  type="checkbox"
                  checked={biayaAdminAktif}
                  onChange={(e) => setBiayaAdminAktif(e.target.checked)}
                />
                <span>Ada biaya admin</span>
              </label>
              {biayaAdminAktif ? (
                <label>
                  Nominal biaya admin (Rp)
                  <input
                    type="number"
                    min={0}
                    step={500}
                    inputMode="numeric"
                    value={biayaAdmin}
                    onChange={(e) => setBiayaAdmin(e.target.value)}
                    placeholder="contoh 2500"
                  />
                </label>
              ) : null}
            </>
          ) : null}

          {tipe === "in" || tipe === "bonus" ? (
            <label>
              Wadah tujuan
              <select value={wadah} onChange={(e) => setWadah(e.target.value)}>
                {tipe === "bonus" ? <option value="">Otomatis (bagi Jajan &amp; Saldo)</option> : null}
                <option value="saldo">Saldo</option>
                <option value="tabungan">Tabungan</option>
                <option value="investasi">Investasi</option>
              </select>
            </label>
          ) : null}

          {tipe === "tarik" || tipe === "pindah" ? (
            <label>
              Dari wadah
              <select value={wadahAsal} onChange={(e) => setWadahAsal(e.target.value)}>
                <option value="saldo">Saldo</option>
                <option value="tabungan">Tabungan</option>
                <option value="investasi">Investasi</option>
              </select>
            </label>
          ) : null}

          {tipe === "pindah" ? (
            <label>
              Ke wadah
              <select value={wadahTujuan} onChange={(e) => setWadahTujuan(e.target.value)}>
                <option value="saldo">Saldo</option>
                <option value="tabungan">Tabungan</option>
                <option value="investasi">Investasi</option>
              </select>
            </label>
          ) : null}

          {tipe === "gaji" ? (
            <label className="cek">
              <input type="checkbox" checked={paksa} onChange={(e) => setPaksa(e.target.checked)} />
              <span>Paksa catat meski jaraknya dekat dengan gaji terakhir</span>
            </label>
          ) : null}

          <Tombol lebar onClick={() => void simpan()} disabled={sibuk || !nominal}>
            {sibuk ? "Menyimpan..." : "Simpan transaksi"}
          </Tombol>
        </div>
      </section>
      ) : null}

      {mode === "riwayat" ? (
      <section className="kartu riwayat-panel">
        <div className="section-title">
          <div>
            <p className="eyebrow">TRANSAKSI</p>
            <h2>Semua transaksi</h2>
          </div>
          <span className="badge">{tersaring.length} catatan</span>
        </div>

        <div className="filter-riwayat">
          <Tombol varian="sekunder" onClick={() => void unduhXlsx(data.transaksi, NAMA_TIPE)}>
            Ekspor rekap (.xlsx)
          </Tombol>
          <span className="muted kecil">Satu sheet per bulan, plus ringkasan, kategori, dan transaksi dibatalkan.</span>
        </div>
        <div className="filter-riwayat">
          <label className="filter-jenis">
            Bulan
            <select
              value={bulanFilter}
              onChange={(e) => {
                setBulanFilter(e.target.value);
                setHalaman(1);
              }}
            >
              <option value="semua">Semua bulan</option>
              {daftarBulan.map((b) => (
                <option key={b} value={b}>
                  {labelBulan(b)}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-cari">
            Cari transaksi
            <input
              value={cari}
              onChange={(e) => {
                setCari(e.target.value);
                setHalaman(1);
              }}
              placeholder="Cari transaksi"
            />
          </label>
        </div>
        <ul className="daftar-transaksi daftar-rapi">
          {tampil.map((t) => {
            const keluar = t.tipe === "out";
            const judul = t.subPost ?? t.label ?? NAMA_TIPE[t.tipe] ?? "Tanpa pos";
            const nilai = keluar ? t.nominal + t.biayaAdmin : t.nominal;
            return (
              <li
                key={t.id}
                className={t.status === "batal" ? "item-transaksi batal" : "item-transaksi"}
                role="button"
                tabIndex={0}
                onClick={() => bukaDetail(t)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    bukaDetail(t);
                  }
                }}
              >
                <span className={keluar ? "avatar-uang" : "avatar-uang masuk"}>
                  {judul.trim().charAt(0).toUpperCase() || "?"}
                </span>
                <div className="ringkas-info">
                  <p className="ringkas-nama">{judul}</p>
                  <p className="muted kecil">
                    {tanggalPendek(t.tanggal)} · {NAMA_TIPE[t.tipe] ?? t.tipe}
                  </p>
                </div>
                <div className="transaksi-kanan">
                  <b className={keluar ? "ringkas-jumlah" : "ringkas-jumlah masuk"}>
                    {keluar ? "−" : "+"} {rp(nilai)}
                  </b>
                  {t.bisaDihapus ? (
                    <button
                      type="button"
                      className="hapus-kecil"
                      onClick={(event) => {
                        event.stopPropagation();
                        void hapus(t.id, `${NAMA_TIPE[t.tipe] ?? t.tipe} ${rp(t.nominal)}`);
                      }}
                      disabled={sibuk}
                    >
                      Hapus
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
          {!tersaring.length ? (
            <li className="kosong">{data.transaksi.length ? "Tidak ada catatan yang cocok." : "Belum ada transaksi."}</li>
          ) : null}
        </ul>
        <Tombol className="tombol-grafik" lebar onClick={() => navigasi("rekap")}>
          Lihat Grafik
        </Tombol>
        {totalHalaman > 1 ? (
          <nav className="paginasi" aria-label="Halaman transaksi">
            <button
              type="button"
              className="panah-halaman"
              onClick={() => setHalaman((h) => Math.max(1, h - 1))}
              disabled={halamanAman <= 1}
              aria-label="Halaman sebelumnya"
              title="Halaman sebelumnya"
            >
              ←
            </button>
            <span aria-live="polite">{halamanAman} / {totalHalaman}</span>
            <button
              type="button"
              className="panah-halaman"
              onClick={() => setHalaman((h) => Math.min(totalHalaman, h + 1))}
              disabled={halamanAman >= totalHalaman}
              aria-label="Halaman berikutnya"
              title="Halaman berikutnya"
            >
              →
            </button>
          </nav>
        ) : null}
      </section>
      ) : null}
    </div>
  );
}

function Pos({
  data,
  kirim,
  sibuk,
  mintaKonfirmasi,
}: {
  data: DashboardData;
  kirim: (url: string, method: string, body?: unknown) => Promise<boolean>;
  sibuk: boolean;
  mintaKonfirmasi: (judul: string, teks: string) => Promise<boolean>;
}) {
  const [grupId, setGrupId] = useState(String(data.grup[0]?.id ?? ""));
  const [nama, setNama] = useState("");
  const [jatah, setJatah] = useState("");
  const [pilih, setPilih] = useState("");
  const [namaBaru, setNamaBaru] = useState("");
  const [alias, setAlias] = useState("");
  const [setup, setSetup] = useState({
    tanggalMulai: data.pengaturan.tanggalMulai ?? data.hariIni,
    saldoAwal: String(data.pengaturan.saldoAwal),
    tabunganAwal: String(data.pengaturan.tabunganAwal),
    investasiAwal: String(data.pengaturan.investasiAwal),
  });

  useEffect(() => {
    setSetup({
      tanggalMulai: data.pengaturan.tanggalMulai ?? data.hariIni,
      saldoAwal: String(data.pengaturan.saldoAwal),
      tabunganAwal: String(data.pengaturan.tabunganAwal),
      investasiAwal: String(data.pengaturan.investasiAwal),
    });
  }, [
    data.pengaturan.tanggalMulai,
    data.pengaturan.saldoAwal,
    data.pengaturan.tabunganAwal,
    data.pengaturan.investasiAwal,
    data.hariIni,
  ]);

  const posAktif = data.posSemua.filter((p) => p.aktif);

  async function tambah() {
    const ok = await kirim("/api/pos", "POST", {
      aksi: "tambah",
      groupId: Number(grupId),
      nama,
      jatah: Number(jatah || 0),
    });
    if (ok) {
      setNama("");
      setJatah("");
    }
  }

  async function gantiNama() {
    if (!pilih) return;
    const ok = await kirim("/api/pos", "POST", { aksi: "ganti_nama", id: Number(pilih), nama: namaBaru });
    if (ok) setNamaBaru("");
  }

  async function tambahAlias() {
    if (!pilih) return;
    const ok = await kirim("/api/pos", "POST", { aksi: "alias", id: Number(pilih), alias });
    if (ok) setAlias("");
  }

  async function nonaktifkan() {
    if (!pilih) return;
    const p = data.posSemua.find((x) => String(x.id) === pilih);
    if (!p) return;
    if (!(await mintaKonfirmasi("Nonaktifkan pos?", `Pos ${p.nama} akan dinonaktifkan.`))) return;
    const ok = await kirim("/api/pos", "POST", { aksi: "nonaktif", id: Number(pilih) });
    if (ok) setPilih("");
  }

  async function simpanSetup() {
    await kirim("/api/setup", "POST", {
      tanggalMulai: setup.tanggalMulai,
      saldoAwal: Number(setup.saldoAwal || 0),
      tabunganAwal: Number(setup.tabunganAwal || 0),
      investasiAwal: Number(setup.investasiAwal || 0),
    });
  }

  return (
    <div className="tumpuk dua-kolom">
      <div className="tumpuk kolom">
        <section className="kartu">
          <h2>Tambah Pos</h2>
        <div className="form">
          <label>
            Grup
            <select value={grupId} onChange={(e) => setGrupId(e.target.value)}>
              {data.grup.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nama}
                </option>
              ))}
            </select>
          </label>
          <label>
            Nama pos
            <input value={nama} onChange={(e) => setNama(e.target.value)} placeholder="contoh: Kopi" />
          </label>
          <label>
            Jatah awal (Rp)
            <input
              type="number"
              min={0}
              step={10000}
              value={jatah}
              onChange={(e) => setJatah(e.target.value)}
              placeholder="0"
            />
          </label>
          <Tombol lebar onClick={() => void tambah()} disabled={sibuk || !nama}>
            Tambah pos
          </Tombol>
          <p className="muted kecil">Pos baru langsung masuk rencana aktif dan berlaku mulai periode berikutnya.</p>
        </div>
      </section>

      <section className="kartu">
        <h2>Kelola Pos</h2>
        <div className="form">
          <label>
            Pilih pos aktif
            <select value={pilih} onChange={(e) => setPilih(e.target.value)}>
              <option value="">Pilih pos</option>
              {posAktif.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.grup} · {p.nama} ({rp(p.jatahRencana)})
                </option>
              ))}
            </select>
          </label>
          <div className="baris-tombol">
            <input value={namaBaru} onChange={(e) => setNamaBaru(e.target.value)} placeholder="Nama baru" />
            <Tombol varian="sekunder" onClick={() => void gantiNama()} disabled={sibuk || !pilih}>
              Ganti nama
            </Tombol>
          </div>
          <div className="baris-tombol">
            <input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="Alias baru" />
            <Tombol varian="sekunder" onClick={() => void tambahAlias()} disabled={sibuk || !pilih}>
              Tambah alias
            </Tombol>
          </div>
          <Tombol varian="bahaya" lebar onClick={() => void nonaktifkan()} disabled={sibuk || !pilih}>
            Nonaktifkan pos
          </Tombol>
        </div>
      </section>
      </div>

      <section className="kartu">
        <h2>Daftar Pos</h2>
        <div className="tabel">
          {data.grup.map((g) => (
            <div key={g.id} className="blok-pos">
              <p className="label">{g.nama}</p>
              <ul>
                {g.pos.map((p) => (
                  <li key={p.id}>
                    <span>{p.nama}</span>
                    <span className="muted">
                      {rp(p.jatahRencana)} · terpakai {rp(p.terpakai)}
                    </span>
                  </li>
                ))}
                {!g.pos.length ? <li className="muted">Belum ada pos aktif.</li> : null}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {data.bolehSetup ? (
        <section className="kartu lebar">
          <h2>Setup Awal</h2>
          <p className="muted">
            Hanya bisa diubah sebelum gaji pertama. Setelah gaji masuk, pengaturan ini dikunci.
          </p>
          <div className="form">
            <label>
              Tanggal mulai
              <input
                type="date"
                max={data.hariIni}
                value={setup.tanggalMulai}
                onChange={(e) => setSetup({ ...setup, tanggalMulai: e.target.value })}
              />
            </label>
            <label>
              Saldo awal (Rp)
              <input
                type="number"
                min={0}
                value={setup.saldoAwal}
                onChange={(e) => setSetup({ ...setup, saldoAwal: e.target.value })}
              />
            </label>
            <label>
              Tabungan awal (Rp)
              <input
                type="number"
                min={0}
                value={setup.tabunganAwal}
                onChange={(e) => setSetup({ ...setup, tabunganAwal: e.target.value })}
              />
            </label>
            <label>
              Investasi awal (Rp)
              <input
                type="number"
                min={0}
                value={setup.investasiAwal}
                onChange={(e) => setSetup({ ...setup, investasiAwal: e.target.value })}
              />
            </label>
            <Tombol lebar onClick={() => void simpanSetup()} disabled={sibuk}>
              Simpan setup
            </Tombol>
          </div>
        </section>
      ) : (
        <section className="kartu lebar">
          <h2>Pengaturan Terkunci</h2>
          <p className="muted">
            Gaji pertama sudah tercatat. Setup awal tidak bisa diubah lagi dari web.
          </p>
          <div className="grid-3">
            <div>
              <p className="label">Tanggal mulai</p>
              <p>{data.pengaturan.tanggalMulai ?? "-"}</p>
            </div>
            <div>
              <p className="label">Saldo awal</p>
              <p>{rp(data.pengaturan.saldoAwal)}</p>
            </div>
            <div>
              <p className="label">Tabungan awal</p>
              <p>{rp(data.pengaturan.tabunganAwal)}</p>
            </div>
            <div>
              <p className="label">Investasi awal</p>
              <p>{rp(data.pengaturan.investasiAwal)}</p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function Target({
  data,
  kirim,
  sibuk,
  mintaKonfirmasi,
}: {
  data: DashboardData;
  kirim: (url: string, method: string, body?: unknown) => Promise<boolean>;
  sibuk: boolean;
  mintaKonfirmasi: (judul: string, teks: string) => Promise<boolean>;
}) {
  const [nama, setNama] = useState("");
  const [targetNominal, setTargetNominal] = useState("");
  const [targetTanggal, setTargetTanggal] = useState("");
  const [catatan, setCatatan] = useState("");
  const [nabungInput, setNabungInput] = useState<Record<number, string>>({});

  async function tambah() {
    const ok = await kirim("/api/goals", "POST", {
      aksi: "tambah",
      nama,
      targetNominal: Number(targetNominal),
      tanggal: data.hariIni,
      targetTanggal: targetTanggal || null,
      catatan: catatan || null,
    });
    if (ok) {
      setNama("");
      setTargetNominal("");
      setTargetTanggal("");
      setCatatan("");
    }
  }

  async function nabung(id: number) {
    const nominal = Number(nabungInput[id] || 0);
    if (!nominal || nominal <= 0) return;
    const ok = await kirim("/api/goals", "POST", { aksi: "nabung", id, nominal });
    if (ok) setNabungInput((b) => ({ ...b, [id]: "" }));
  }

  async function batal(id: number, nama: string) {
    if (!(await mintaKonfirmasi("Batalkan target?", `Target ${nama} akan dibatalkan.`))) return;
    await kirim("/api/goals", "POST", { aksi: "batal", id });
  }

  const aktif = data.goals.filter((g) => g.status === "aktif");
  const selesai = data.goals.filter((g) => g.status !== "aktif");

  return (
    <div className="tumpuk dua-kolom">
      <section className="kartu">
        <h2>Buat Target Tabungan</h2>
        <div className="form">
          <label>
            Nama target
            <input value={nama} onChange={(e) => setNama(e.target.value)} placeholder="contoh: Laptop Baru" />
          </label>
          <label>
            Nominal target (Rp)
            <input
              type="number"
              min={1}
              step={10000}
              inputMode="numeric"
              value={targetNominal}
              onChange={(e) => setTargetNominal(e.target.value)}
              placeholder="contoh 5000000"
            />
          </label>
          <label>
            Target tanggal tercapai (opsional)
            <input type="date" value={targetTanggal} onChange={(e) => setTargetTanggal(e.target.value)} />
          </label>
          <label>
            Catatan (opsional)
            <input value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="contoh untuk kerja" />
          </label>
          <Tombol
            lebar
            onClick={() => void tambah()}
            disabled={sibuk || !nama || !targetNominal}
          >
            Simpan
          </Tombol>
        </div>
      </section>

      <section className="kartu">
        <h2>Aktif</h2>
        <ul className="daftar-transaksi">
          {aktif.map((g) => (
            <li key={g.id}>
              <div className="transaksi-kiri" style={{ flex: 1 }}>
                <div style={{ flex: 1 }}>
                  <div className="baris-antara">
                    <p className="nama-transaksi">{g.nama}</p>
                    <span className="muted kecil">{Math.round(g.progres * 100)}%</span>
                  </div>
                  <div className="bar">
                    <span style={{ width: `${Math.round(g.progres * 100)}%` }} />
                  </div>
                  <p className="muted kecil">
                    Terkumpul {rp(g.terkumpul)} dari {rp(g.targetNominal)} (sisa {rp(g.sisa)})
                    {g.targetTanggal ? ` · target ${g.targetTanggal}${g.lewatTempo ? " (lewat)" : ""}` : ""}
                  </p>
                  <div className="baris-tombol" style={{ marginTop: 6 }}>
                    <input
                      type="number"
                      min={1}
                      step={1000}
                      placeholder="Nabung nominal"
                      value={nabungInput[g.id] ?? ""}
                      onChange={(e) => setNabungInput((b) => ({ ...b, [g.id]: e.target.value }))}
                    />
                    <Tombol onClick={() => void nabung(g.id)} disabled={sibuk}>
                      Nabung
                    </Tombol>
                  </div>
                </div>
              </div>
              <div className="transaksi-kanan">
                <Tombol varian="bahaya" ukuran="kecil" onClick={() => void batal(g.id, g.nama)} disabled={sibuk}>
                  Batal
                </Tombol>
              </div>
            </li>
          ))}
          {!aktif.length ? <li className="kosong">Belum ada target tabungan aktif.</li> : null}
        </ul>
      </section>

      {selesai.length ? (
        <section className="kartu lebar">
          <h2>Riwayat</h2>
          <ul className="daftar-transaksi">
            {selesai.map((g) => (
              <li key={g.id} className={g.status === "batal" ? "batal" : undefined}>
                <div className="transaksi-kiri">
                  <span className={`badge ${g.status === "selesai" ? "tipe-in" : ""}`}>
                    {g.status === "selesai" ? "Tercapai" : "Dibatalkan"}
                  </span>
                  <div>
                    <p className="nama-transaksi">{g.nama}</p>
                    <p className="muted kecil">
                      {rp(g.terkumpul)} dari {rp(g.targetNominal)}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}


function Piutang({
  data,
  kirim,
  sibuk,
  mintaKonfirmasi,
}: {
  data: DashboardData;
  kirim: (url: string, method: string, body?: unknown) => Promise<boolean>;
  sibuk: boolean;
  mintaKonfirmasi: (judul: string, teks: string) => Promise<boolean>;
}) {
  const [jenis, setJenis] = useState<"piutang" | "utang">("piutang");
  const [nama, setNama] = useState("");
  const [nominal, setNominal] = useState("");
  const [jatuhTempo, setJatuhTempo] = useState("");
  const [catatan, setCatatan] = useState("");
  const [bayarInput, setBayarInput] = useState<Record<number, string>>({});

  async function tambah() {
    const ok = await kirim("/api/debts", "POST", {
      aksi: "tambah",
      jenis,
      nama,
      nominal: Number(nominal),
      tanggal: data.hariIni,
      jatuhTempo: jatuhTempo || null,
      catatan: catatan || null,
    });
    if (ok) {
      setNama("");
      setNominal("");
      setJatuhTempo("");
      setCatatan("");
    }
  }

  async function bayar(id: number, penuh: boolean) {
    const nominalBayar = penuh ? null : Number(bayarInput[id] || 0);
    if (!penuh && (!nominalBayar || nominalBayar <= 0)) return;
    const ok = await kirim("/api/debts", "POST", { aksi: "bayar", id, nominal: nominalBayar });
    if (ok) setBayarInput((b) => ({ ...b, [id]: "" }));
  }

  async function batal(id: number, nama: string) {
    if (!(await mintaKonfirmasi("Batalkan catatan?", `Catatan ${nama} akan dibatalkan.`))) return;
    await kirim("/api/debts", "POST", { aksi: "batal", id });
  }

  const aktif = data.piutang.filter((d) => d.status === "aktif");
  const selesai = data.piutang.filter((d) => d.status !== "aktif");
  const totalPiutang = aktif.filter((d) => d.jenis === "piutang").reduce((s, d) => s + d.sisa, 0);
  const totalUtang = aktif.filter((d) => d.jenis === "utang").reduce((s, d) => s + d.sisa, 0);

  return (
    <div className="tumpuk dua-kolom">
      <section className="grid-2 lebar">
        <div className="kartu">
          <p className="label">Piutang Aktif</p>
          <p className="angka">{rp(totalPiutang)}</p>
          <p className="muted">Orang berutang ke kita</p>
        </div>
        <div className="kartu">
          <p className="label">Utang Aktif</p>
          <p className="angka">{rp(totalUtang)}</p>
          <p className="muted">Kita berutang</p>
        </div>
      </section>

      <section className="kartu">
        <h2>Catat Piutang/Utang</h2>
        <div className="form">
          <label>
            Jenis
            <select value={jenis} onChange={(e) => setJenis(e.target.value as "piutang" | "utang")}>
              <option value="piutang">Piutang (orang berutang ke kita)</option>
              <option value="utang">Utang (kita berutang)</option>
            </select>
          </label>
          <label>
            Nama
            <input value={nama} onChange={(e) => setNama(e.target.value)} placeholder="contoh: Andi" />
          </label>
          <label>
            Nominal (Rp)
            <input
              type="number"
              min={1}
              step={1000}
              inputMode="numeric"
              value={nominal}
              onChange={(e) => setNominal(e.target.value)}
              placeholder="contoh 100000"
            />
          </label>
          <label>
            Jatuh tempo (opsional)
            <input type="date" value={jatuhTempo} onChange={(e) => setJatuhTempo(e.target.value)} />
          </label>
          <label>
            Catatan (opsional)
            <input value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="contoh pinjam untuk..." />
          </label>
          <Tombol
            lebar
            onClick={() => void tambah()}
            disabled={sibuk || !nama || !nominal}
          >
            Simpan
          </Tombol>
        </div>
      </section>

      <section className="kartu">
        <h2>Aktif</h2>
        <ul className="daftar-transaksi">
          {aktif.map((d) => (
            <li key={d.id}>
              <div className="transaksi-kiri">
                <span className={`badge ${d.jenis === "piutang" ? "tipe-in" : "tipe-out"}`}>
                  {d.jenis === "piutang" ? "Piutang" : "Utang"}
                </span>
                <div>
                  <p className="nama-transaksi">{d.nama}</p>
                  <p className="muted kecil">
                    Sisa {rp(d.sisa)} dari {rp(d.nominal)}
                    {d.jatuhTempo ? ` · tempo ${d.jatuhTempo}${d.lewatTempo ? " (lewat)" : ""}` : ""}
                  </p>
                  <div className="baris-tombol" style={{ marginTop: 6 }}>
                    <input
                      type="number"
                      min={1}
                      step={1000}
                      placeholder="Bayar sebagian"
                      value={bayarInput[d.id] ?? ""}
                      onChange={(e) => setBayarInput((b) => ({ ...b, [d.id]: e.target.value }))}
                    />
                    <Tombol varian="sekunder" onClick={() => void bayar(d.id, false)} disabled={sibuk}>
                      Bayar
                    </Tombol>
                    <Tombol onClick={() => void bayar(d.id, true)} disabled={sibuk}>
                      Lunas
                    </Tombol>
                  </div>
                </div>
              </div>
              <div className="transaksi-kanan">
                <Tombol varian="bahaya" ukuran="kecil" onClick={() => void batal(d.id, d.nama)} disabled={sibuk}>
                  Batal
                </Tombol>
              </div>
            </li>
          ))}
          {!aktif.length ? <li className="kosong">Belum ada piutang/utang aktif.</li> : null}
        </ul>
      </section>

      {selesai.length ? (
        <section className="kartu lebar">
          <h2>Riwayat</h2>
          <ul className="daftar-transaksi">
            {selesai.map((d) => (
              <li key={d.id} className={d.status === "batal" ? "batal" : undefined}>
                <div className="transaksi-kiri">
                  <span className={`badge ${d.jenis === "piutang" ? "tipe-in" : "tipe-out"}`}>
                    {d.jenis === "piutang" ? "Piutang" : "Utang"}
                  </span>
                  <div>
                    <p className="nama-transaksi">{d.nama}</p>
                    <p className="muted kecil">
                      {rp(d.nominal)} · {d.status === "lunas" ? "lunas" : "dibatalkan"}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
