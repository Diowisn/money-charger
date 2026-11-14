"use client";

import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { Tombol } from "@/components/tombol";
import type { DashboardData, TxView } from "@/lib/dashboard";
import { DetailDialog, KonfirmasiDialog, ScanDialog } from "./view/dialog";
import { INTERVAL_LIVE_MS, temaAwal, transaksiEmailBaru as saringTransaksiEmailBaru } from "./view/format";
import { kompresGambar } from "./view/gambar";
import { IkonLainnya, IkonRekap, IkonRingkasan, IkonTambah, IkonTransaksi, IkonWawasan } from "./view/ikon";
import { JUDUL_TAB, MENU_SAMPING, TAB_UTAMA } from "./view/menu";
import { Asisten } from "./view/tab-asisten";
import { Dompet } from "./view/tab-dompet";
import { Impor } from "./view/tab-impor";
import { Lainnya } from "./view/tab-lainnya";
import { Piutang } from "./view/tab-piutang";
import { Otomatis } from "./view/tab-otomatis";
import { Pos } from "./view/tab-pos";
import { Laporan } from "./view/tab-laporan";
import { Profil } from "./view/tab-profil";
import { Rekap } from "./view/tab-rekap";
import { Rencana } from "./view/tab-rencana";
import { Ringkasan } from "./view/tab-ringkasan";
import { Target } from "./view/tab-target";
import { Transaksi } from "./view/tab-transaksi";
import { Wawasan } from "./view/tab-wawasan";
import type { HasilScan, Konfirmasi, Pesan, StatusLive, Tab, Tema } from "./view/tipe";

export default function Dashboard({ awal, emailSetupSiap = false }: { awal: DashboardData; emailSetupSiap?: boolean }) {
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
  const knownTxIdsRef = useRef(new Set(awal.transaksi.map((tx) => tx.id)));
  const sibukRef = useRef(false);
  const urutanRef = useRef(0);

  useEffect(() => {
    dataRef.current = awal;
    setData(awal);
  }, [awal]);

  useEffect(() => {
    if (!pesan) return;
    const timer = setTimeout(() => setPesan(null), 4000);
    return () => clearTimeout(timer);
  }, [pesan]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("sheets");
    if (status !== "ok" && status !== "gagal") return;
    const sebab = params.get("sebab");
    setTab("laporan");
    setPesan({
      jenis: status === "ok" ? "ok" : "error",
      teks:
        status === "ok"
          ? "Google Sheets terhubung. Spreadsheet privat dibuat dan transaksi disalin otomatis."
          : `Koneksi Google Sheets gagal. Coba hubungkan ulang dari tab Laporan.${sebab ? ` (${sebab})` : ""}`,
    });
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

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
      const transaksiEmailBaru = saringTransaksiEmailBaru(j.data.transaksi, knownTxIdsRef.current);
      for (const tx of j.data.transaksi) knownTxIdsRef.current.add(tx.id);
      if (transaksiEmailBaru.length) {
        const tx = transaksiEmailBaru[0];
        const sumber = transaksiEmailBaru.length > 1 ? `${transaksiEmailBaru.length} transaksi email baru` : `Transaksi email masuk: ${tx.label || tx.subPost || "Transaksi"} Rp${tx.nominal.toLocaleString("id-ID")}`;
        setPesan({ jenis: "ok", teks: sumber });
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
      form.append("image", await kompresGambar(file));
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

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-merek">
          <img src="/icon-192.png" alt="" width={36} height={36} />
          <b>Money-Charger</b>
        </div>
        <nav className="sidebar-nav" aria-label="Navigasi utama">
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
        </nav>
        <div className="sidebar-promo">
          <span className="sidebar-promo-ikon" aria-hidden="true">
            <IkonTambah aktif />
          </span>
          <p>Catat pemasukan, pengeluaran, dan target dari satu tempat.</p>
          <Tombol className="sidebar-promo-tombol" onClick={() => catat("out")}>
            Catat sekarang
          </Tombol>
        </div>
      </aside>

      <div className="app-main">
        <header className="cn-top">
          <h1>{tab === "ringkasan" ? "Dashboard" : JUDUL_TAB[tab]}</h1>
        </header>

        {pesan ? (
          <div className={`toast ${pesan.jenis}`} role="status">
            <span>{pesan.teks}</span>
            <button type="button" onClick={() => setPesan(null)} aria-label="Tutup">
              ×
            </button>
          </div>
        ) : null}

        {hasilScan ? (
          <ScanDialog
            data={data}
            hasilScan={hasilScan}
            setHasilScan={setHasilScan}
            editScan={editScan}
            setEditScan={setEditScan}
            sibuk={sibuk}
            simpan={() => void simpanHasilScan()}
          />
        ) : null}
        {scanSibuk ? <div className="toast" role="status">Membaca struk…</div> : null}
        {konfirmasi ? <KonfirmasiDialog konfirmasi={konfirmasi} setKonfirmasi={setKonfirmasi} /> : null}
        {detailTx ? (
          <DetailDialog
            key={detailTx.id}
            detailTx={detailTx}
            data={data}
            sibuk={sibuk}
            simpanUbah={(body) => kirim("/api/transactions", "PATCH", body)}
            tutup={() => setDetailTx(null)}
          />
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
          {tab === "laporan" ? <Laporan data={data} kirim={kirim} sibuk={sibuk} /> : null}
          {tab === "wawasan" ? <Wawasan data={data} kirim={kirim} sibuk={sibuk} /> : null}
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
          {tab === "dompet" ? <Dompet data={data} kirim={kirim} sibuk={sibuk} /> : null}
                    {tab === "piutang" ? <Piutang data={data} kirim={kirim} sibuk={sibuk} mintaKonfirmasi={mintaKonfirmasi} /> : null}
          {tab === "target" ? <Target data={data} kirim={kirim} sibuk={sibuk} mintaKonfirmasi={mintaKonfirmasi} /> : null}
          {tab === "otomatis" ? <Otomatis data={data} kirim={kirim} sibuk={sibuk} mintaKonfirmasi={mintaKonfirmasi} emailSetupSiap={emailSetupSiap} /> : null}
          {tab === "impor" ? <Impor kirim={kirim} sibuk={sibuk} /> : null}
          {tab === "asisten" ? <Asisten data={data} kirim={kirim} sibuk={sibuk} /> : null}
          {tab === "lainnya" ? <Lainnya navigasi={navigasiKe} /> : null}
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
              ["wawasan", "Analisis", IkonWawasan],
              ["lainnya", "Lainnya", IkonLainnya],
            ] as [Tab, string, (p: { aktif: boolean }) => ReactElement][]
          ).map(([id, label, Ikon]) => {
            const aktif = tab === id || (id === "lainnya" && !TAB_UTAMA.has(tab));
            return (
              <button
                key={id}
                type="button"
                className={`nav-item${aktif ? " aktif" : ""}`}
                aria-current={aktif ? "page" : undefined}
                onClick={() => {
                  navigasiKe(id);
                }}
              >
                <Ikon aktif={aktif} />
                <span>{label}</span>
              </button>
            );
          })}
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
