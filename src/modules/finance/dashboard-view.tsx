"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import type { DashboardData } from "@/lib/dashboard";

type Pesan = { jenis: "ok" | "error"; teks: string };
type Tab = "ringkasan" | "rencana" | "transaksi" | "pos" | "piutang" | "target" | "asisten";
type StatusLive = "hidup" | "terputus";

const INTERVAL_LIVE_MS = 5000;

const WARNA = ["#5d7184", "#8fa2b4", "#2e4053", "#b4c1cd", "#728699", "#4a5f73", "#9aaebd"];
const NAMA_WADAH: Record<string, string> = { saldo: "Saldo", tabungan: "Tabungan", investasi: "Investasi" };
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
const persen = (n: number) => `${Math.round(n * 100)}%`;
const persenDari = (n: number, total: number) =>
  total > 0 ? `${Math.min(100, Math.round((n / total) * 100))}%` : "0%";

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

function IkonLain({ aktif }: { aktif: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={aktif ? 2.4 : 1.8}>
      <circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

const MENU_LAIN: [Tab, string, (p: { aktif: boolean }) => ReactElement][] = [
  ["pos", "Pos", IkonPos],
  ["piutang", "Piutang", IkonPiutang],
  ["target", "Target", IkonTarget],
];

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
  const [buka, setBuka] = useState<Record<number, boolean>>(() => ({ [awal.grup[0]?.id ?? 0]: true }));
  const [statusLive, setStatusLive] = useState<StatusLive>("hidup");
  const [terakhir, setTerakhir] = useState<number | null>(null);
  const [tema, setTema] = useState<Tema>("terang");
  const [menuLain, setMenuLain] = useState(false);
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
    document.documentElement.dataset.theme = tema === "gelap" ? "dark" : "light";
    window.localStorage.setItem("mc_tema", tema);
  }, [tema]);

  async function keluar() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  async function keluarSemua() {
    if (!window.confirm("Cabut semua sesi dashboard? Perangkat ini juga akan keluar.")) return;
    const res = await fetch("/api/auth/logout-all", { method: "POST" });
    if (res.ok) window.location.href = "/login";
    else setPesan({ jenis: "error", teks: "Gagal mencabut semua sesi." });
  }

  const jamTerakhir = terakhir
    ? new Date(terakhir).toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : null;
  const lebihAktif = tab === "pos" || tab === "piutang" || tab === "target";

  return (
    <div className="app">
      <header className="topbar">
        <div className="merek">
          <img className="logo-app" src="/icon-192.png" alt="" width={48} height={48} />
          <div className="merek-teks">
            <p className="eyebrow">Money-Charger</p>
            <h1>{data.periode.aktif ? "Periode aktif" : "Periode awal"}</h1>
            <p className="muted kecil">
              {data.periode.aktif
                ? `Hari ke-${data.periode.hariKe} · mulai ${data.periode.mulai}${
                    data.periode.akhir ? ` · sampai ${data.periode.akhir}` : ""
                  }`
                : `Hari ini ${data.hariIni}`}
            </p>
          </div>
        </div>
        <div className="topbar-aksi">
          <span
            className={`status-live ${statusLive}`}
            role="status"
            aria-live="polite"
            title={statusLive === "hidup" ? "Data tersinkron otomatis" : "Koneksi terputus"}
          >
            <i />
            <span className="status-teks">{statusLive === "hidup" ? "Live" : "Terputus"}</span>
          </span>
          <button
            className="ghost"
            type="button"
            onClick={() => setTema((t) => (t === "gelap" ? "terang" : "gelap"))}
            aria-label={tema === "gelap" ? "Pakai mode terang" : "Pakai mode gelap"}
            title={tema === "gelap" ? "Mode terang" : "Mode gelap"}
          >
            {tema === "gelap" ? "Terang" : "Gelap"}
          </button>
          <details className="menu-akun">
            <summary className="ghost">Akun</summary>
            <div className="menu-akun-isi">
              <button type="button" onClick={() => void keluarSemua()}>
                Keluar semua perangkat
              </button>
              <button type="button" onClick={() => void keluar()}>
                Keluar
              </button>
            </div>
          </details>
        </div>
      </header>

      {pesan ? (
        <div className={`toast ${pesan.jenis}`} role="status">
          <span>{pesan.teks}</span>
          <button type="button" onClick={() => setPesan(null)} aria-label="Tutup">
            ×
          </button>
        </div>
      ) : null}

      <nav className="tabs" aria-label="Menu dashboard">
        {(
          [
            ["ringkasan", "Ringkasan"],
            ["rencana", "Rencana"],
            ["transaksi", "Transaksi"],
            ["pos", "Pos"],
            ["piutang", "Piutang"],
            ["target", "Target"],
            ["asisten", "Asisten"],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? "tab aktif" : "tab"}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      <main className="konten">
        {tab === "ringkasan" ? (
          <Ringkasan data={data} buka={buka} setBuka={setBuka} />
        ) : null}
        {tab === "rencana" ? (
          <Rencana data={data} kirim={kirim} sibuk={sibuk} />
        ) : null}
        {tab === "transaksi" ? (
          <Transaksi data={data} kirim={kirim} sibuk={sibuk} />
        ) : null}
        {tab === "pos" ? <Pos data={data} kirim={kirim} sibuk={sibuk} /> : null}
        {tab === "piutang" ? <Piutang data={data} kirim={kirim} sibuk={sibuk} /> : null}
        {tab === "target" ? <Target data={data} kirim={kirim} sibuk={sibuk} /> : null}
        {tab === "asisten" ? <Asisten /> : null}
      </main>

      {menuLain ? (
        <div className="lebih-panel" id="menu-lain" aria-label="Menu lainnya">
          {MENU_LAIN.map(([id, label, Ikon]) => (
            <button
              key={id}
              type="button"
              className={tab === id ? "lebih-item aktif" : "lebih-item"}
              onClick={() => {
                setTab(id);
                setMenuLain(false);
              }}
            >
              <Ikon aktif={tab === id} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      ) : null}

      <nav className="bottom-nav" aria-label="Menu dashboard (mobile)">
        {(
          [
            ["ringkasan", "Ringkasan", IkonRingkasan],
            ["rencana", "Rencana", IkonRencana],
            ["transaksi", "Transaksi", IkonTransaksi],
            ["asisten", "Asisten", IkonAsisten],
          ] as [Tab, string, (p: { aktif: boolean }) => ReactElement][]
        ).map(([id, label, Ikon]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? "nav-item aktif" : "nav-item"}
            onClick={() => {
              setTab(id);
              setMenuLain(false);
            }}
          >
            <Ikon aktif={tab === id} />
            <span>{label}</span>
          </button>
        ))}
        <button
          type="button"
          className={lebihAktif || menuLain ? "nav-item aktif" : "nav-item"}
          onClick={() => setMenuLain((v) => !v)}
          aria-expanded={menuLain}
          aria-controls="menu-lain"
        >
          <IkonLain aktif={lebihAktif || menuLain} />
          <span>Lainnya</span>
        </button>
      </nav>

      <footer className="kaki">
        <span>
          {statusLive === "hidup"
            ? `Tersinkron otomatis${jamTerakhir ? ` · ${jamTerakhir}` : ""}`
            : "Koneksi terputus · mencoba lagi..."}
        </span>
        <button type="button" className="tautan" onClick={() => void muatUlang(false)} disabled={sibuk}>
          Muat ulang
        </button>
      </footer>
    </div>
  );
}

function Ringkasan({
  data,
  buka,
  setBuka,
}: {
  data: DashboardData;
  buka: Record<number, boolean>;
  setBuka: (v: Record<number, boolean>) => void;
}) {
  const r = data.ringkasan;
  const totalGrup = data.grup.reduce((s, g) => s + g.jatah, 0);
  const toggle = (id: number) => setBuka({ ...buka, [id]: !buka[id] });
  const tren = data.tren ?? [];
  const maksTren = Math.max(1, ...tren.map((t) => t.pengeluaran));
  const totalTren = tren.reduce((s, t) => s + t.pengeluaran, 0);
  const hariTren = tren.filter((t) => t.pengeluaran > 0).length;

  return (
    <div className="tumpuk ringkasan-grid">
      <section className="kartu sorot">
        <div className="baris-antara">
          <div>
            <p className="label">Sisa Uang</p>
            <p className="angka-besar">{rp(r.sisaUang)}</p>
            <p className="muted">Potensi Dana Darurat &amp; Investasi Diri</p>
          </div>
          <div className="cincin">
            <span>{persen(r.rasio)}</span>
          </div>
        </div>
        <div className="bar tebal">
          <span style={{ width: persen(r.rasio) }} />
        </div>
        <div className="baris-antara kecil">
          <span>Terpakai {rp(r.terpakai)}</span>
          <span>Total {rp(r.totalRencana)}</span>
        </div>
        {r.belumDipetakan > 0 ? (
          <p className="muted kecil">Termasuk {rp(r.belumDipetakan)} pengeluaran tanpa pos.</p>
        ) : null}
      </section>

      <section className="grid-2">
        <div className="kartu">
          <p className="label">Pendapatan Bulan Ini</p>
          <p className="angka">{rp(r.pendapatanBulanIni)}</p>
          <p className="muted">Gaji, pemasukan, bonus</p>
        </div>
        <div className="kartu">
          <p className="label">Pengeluaran Bulan Ini</p>
          <p className="angka">{rp(r.pengeluaranBulanIni)}</p>
          <p className="muted">Semua pengeluaran tercatat</p>
        </div>
      </section>

      <section className="kartu setengah">
        <div className="baris-antara">
          <div>
            <h2>Tren Pengeluaran</h2>
            <p className="muted kecil">{tren.length} hari terakhir</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <p className="angka-kecil">{rp(totalTren)}</p>
            <p className="muted kecil">
              {hariTren} hari ada pengeluaran
            </p>
          </div>
        </div>
        {totalTren > 0 ? (
          <>
            <div className="tren" role="img" aria-label={`Pengeluaran ${tren.length} hari terakhir`}>
              {tren.map((t) => (
                <div className="tren-kolom" key={t.tanggal} title={`${t.tanggal}: ${rp(t.pengeluaran)}`}>
                  <span
                    className="tren-batang"
                    style={{ height: `${Math.max(2, (t.pengeluaran / maksTren) * 100)}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="tren-label">
              {tren.map((t, i) => (
                <span key={t.tanggal}>{i % 2 === 0 ? t.tanggal.slice(8) : ""}</span>
              ))}
            </div>
          </>
        ) : (
          <p className="muted kecil">Belum ada pengeluaran pada rentang ini.</p>
        )}
        <p className="muted kecil">Rata-rata {rp(totalTren / Math.max(1, tren.length))} per hari · tertinggi {rp(maksTren)}</p>
      </section>

      <section className="kartu setengah">
        <div className="baris-antara">
          <h2>Alokasi per Grup</h2>
          <span className="muted kecil">{rp(totalGrup)}</span>
        </div>
        <div className="bar warna">
          {data.grup.map((g, i) => (
            <span
              key={g.id}
              title={`${g.nama}: ${rp(g.jatah)}`}
              style={{ width: persenDari(g.jatah, totalGrup), background: WARNA[i % WARNA.length] }}
            />
          ))}
        </div>
        <ul className="legenda">
          {data.grup.map((g, i) => (
            <li key={g.id}>
              <i style={{ background: WARNA[i % WARNA.length] }} />
              <span>{g.nama}</span>
              <b>{rp(g.jatah)}</b>
            </li>
          ))}
        </ul>
        <p className="muted kecil">
          Terpakai {rp(data.grup.reduce((s, g) => s + g.terpakai, 0))}
          {r.belumDipetakan > 0 ? ` · tanpa pos ${rp(r.belumDipetakan)}` : ""}
        </p>
      </section>

      <section className="tumpuk">
        {data.grup.map((g) => {
          const terbuka = Boolean(buka[g.id]);
          return (
            <div className="kartu grup" key={g.id}>
              <button className="kepala-grup" type="button" onClick={() => toggle(g.id)}>
                <div>
                  <p className="label">{g.nama}</p>
                  <p className="angka">{rp(g.jatah)}</p>
                </div>
                <div className="kanan-grup">
                  <span className="muted">Sisa {rp(Math.max(0, g.jatah - g.terpakai))}</span>
                  <span className={terbuka ? "panah buka" : "panah"}>v</span>
                </div>
              </button>
              <div className="bar">
                <span style={{ width: persenDari(g.terpakai, g.jatah) }} />
              </div>
              {terbuka ? (
                <ul className="daftar-pos">
                  {g.pos.map((p) => (
                    <li key={p.id}>
                      <div className="baris-antara">
                        <span>{p.nama}</span>
                        <span className={p.lewat > 0 ? "merah" : "muted"}>
                          {p.lewat > 0 ? `Lewat ${rp(p.lewat)}` : `Sisa ${rp(p.sisa)}`}
                        </span>
                      </div>
                      <div className="bar tipis">
                        <span
                          className={p.lewat > 0 ? "isi-lewat" : undefined}
                          style={{ width: persenDari(p.terpakai, Math.max(p.jatah, p.terpakai)) }}
                        />
                      </div>
                      <div className="baris-antara kecil muted">
                        <span>Jatah {rp(p.jatah)}</span>
                        <span>Terpakai {rp(p.terpakai)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
      </section>

      <section className="grid-3">
        <div className="kartu mini">
          <p className="label">Dana Darurat</p>
          <p className="angka">{rp(data.posLain.ddSisa)}</p>
          <p className="muted">dari {rp(data.posLain.dd)}</p>
          {r.kekuranganDD > 0 ? <p className="merah kecil">Kurang {rp(r.kekuranganDD)}</p> : null}
        </div>
        <div className="kartu mini">
          <p className="label">Tabungan</p>
          <p className="angka">{rp(r.tabungan)}</p>
          <p className="muted">Jatah {rp(data.posLain.tabungan)}</p>
        </div>
        <div className="kartu mini">
          <p className="label">Investasi</p>
          <p className="angka">{rp(r.investasi)}</p>
          <p className="muted">Jatah {rp(data.posLain.investasi)}</p>
        </div>
      </section>

      <section className="kartu">
        <div className="baris-antara">
          <h2>Saldo &amp; Wadah</h2>
        </div>
        <div className="grid-3">
          <div>
            <p className="label">Saldo</p>
            <p className="angka-kecil">{rp(r.saldo)}</p>
          </div>
          <div>
            <p className="label">Tabungan</p>
            <p className="angka-kecil">{rp(r.tabungan)}</p>
          </div>
          <div>
            <p className="label">Investasi</p>
            <p className="angka-kecil">{rp(r.investasi)}</p>
          </div>
        </div>
      </section>

      {r.piutangAktif > 0 || r.utangAktif > 0 ? (
        <section className="grid-2">
          <div className="kartu">
            <p className="label">Piutang Aktif</p>
            <p className="angka">{rp(r.piutangAktif)}</p>
            <p className="muted">Orang berutang ke kita</p>
          </div>
          <div className="kartu">
            <p className="label">Utang Aktif</p>
            <p className="angka">{rp(r.utangAktif)}</p>
            <p className="muted">Kita berutang</p>
          </div>
        </section>
      ) : null}

      {r.goalTargetAktif > 0 ? (
        <section className="kartu">
          <div className="baris-antara">
            <p className="label">Target Tabungan Aktif</p>
            <span className="muted kecil">
              {rp(r.goalTerkumpulAktif)} / {rp(r.goalTargetAktif)}
            </span>
          </div>
          <div className="bar tebal">
            <span style={{ width: persenDari(r.goalTerkumpulAktif, r.goalTargetAktif) }} />
          </div>
        </section>
      ) : null}
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
              {m.teks}
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
          <button type="submit" disabled={sibuk || teks.trim().length < 3}>
            Kirim
          </button>
        </form>
        <p className="muted kecil">
          {riwayat.length ? (
            <button type="button" className="tautan" onClick={() => setRiwayat([])}>
              Bersihkan percakapan
            </button>
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
          <button type="button" className="sekunder" onClick={() => setDraf(drafRencana(data))} disabled={sibuk}>
            Reset
          </button>
          <button type="button" className="utama" onClick={() => void simpan()} disabled={sibuk}>
            {sibuk ? "Menyimpan..." : "Simpan rencana"}
          </button>
        </div>
      </section>
    </div>
  );
}

function Transaksi({
  data,
  kirim,
  sibuk,
}: {
  data: DashboardData;
  kirim: (url: string, method: string, body?: unknown) => Promise<boolean>;
  sibuk: boolean;
}) {
  const [tipe, setTipe] = useState("out");
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
  const [filterTipe, setFilterTipe] = useState("semua");
  const [cari, setCari] = useState("");
  const [halaman, setHalaman] = useState(1);

  const posAktif = data.posSemua.filter((p) => p.aktif);
  const PER_HALAMAN = 10;

  const tersaring = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return data.transaksi.filter((t) => {
      if (filterTipe !== "semua" && t.tipe !== filterTipe) return false;
      if (!q) return true;
      const isi = `${t.subPost ?? ""} ${t.label ?? ""} ${t.tanggal} ${t.wadahTujuan ?? ""} ${t.wadahAsal ?? ""}`;
      return isi.toLowerCase().includes(q);
    });
  }, [data.transaksi, filterTipe, cari]);

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
    if (!window.confirm(`Batalkan ${teks}?`)) return;
    await kirim("/api/transactions", "DELETE", { id });
  }

  return (
    <div className="tumpuk dua-kolom">
      <section className="kartu">
        <h2>Catat Transaksi</h2>
        <div className="form">
          <label>
            Jenis
            <select value={tipe} onChange={(e) => setTipe(e.target.value)}>
              <option value="out">Pengeluaran</option>
              <option value="in">Pemasukan</option>
              <option value="gaji">Gaji</option>
              <option value="bonus">Bonus</option>
              <option value="tarik">Tarik dari wadah</option>
              <option value="pindah">Pindah antar wadah</option>
            </select>
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
                      {p.grup} A� {p.nama}
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

          <button type="button" className="utama lebar" onClick={() => void simpan()} disabled={sibuk || !nominal}>
            {sibuk ? "Menyimpan..." : "Simpan transaksi"}
          </button>
        </div>
      </section>

      <section className="kartu">
        <div className="baris-antara">
          <h2>Riwayat</h2>
          <span className="muted kecil">
            {tersaring.length} dari {data.transaksi.length} catatan
          </span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          <label className="muted kecil">
            Jenis{" "}
            <select
              value={filterTipe}
              onChange={(e) => {
                setFilterTipe(e.target.value);
                setHalaman(1);
              }}
            >
              <option value="semua">Semua</option>
              <option value="out">Pengeluaran</option>
              <option value="in">Pemasukan</option>
              <option value="gaji">Gaji</option>
              <option value="bonus">Bonus</option>
              <option value="tarik">Tarik</option>
              <option value="pindah">Pindah</option>
            </select>
          </label>
          <input
            value={cari}
            onChange={(e) => {
              setCari(e.target.value);
              setHalaman(1);
            }}
            placeholder="Cari pos, catatan, atau tanggal..."
            style={{ flex: 1, minWidth: 180 }}
          />
        </div>
        <ul className="daftar-transaksi">
          {tampil.map((t) => (
            <li key={t.id} className={t.status === "batal" ? "batal" : undefined}>
              <div className="transaksi-kiri">
                <span className={`badge tipe-${t.tipe}`}>{NAMA_TIPE[t.tipe] ?? t.tipe}</span>
                <div>
                  <p className="nama-transaksi">
                    {t.subPost ?? (t.wadahTujuan ? NAMA_WADAH[t.wadahTujuan] : "Tanpa pos")}
                    {t.label ? ` · ${t.label}` : ""}
                  </p>
                  <p className="muted kecil">
                    {t.tanggal}
                    {t.wadahAsal ? ` A� dari ${NAMA_WADAH[t.wadahAsal]}` : ""}
                    {t.biayaAdmin > 0 ? ` A� admin ${rp(t.biayaAdmin)}` : ""}
                    {t.status === "batal" ? " A� dibatalkan" : ""}
                  </p>
                </div>
              </div>
              <div className="transaksi-kanan">
                <b>{rp(t.nominal + t.biayaAdmin)}</b>
                {t.bisaDihapus ? (
                  <button
                    type="button"
                    className="hapus"
                    onClick={() => void hapus(t.id, `${NAMA_TIPE[t.tipe] ?? t.tipe} ${rp(t.nominal)}`)}
                    disabled={sibuk}
                  >
                    Hapus
                  </button>
                ) : null}
              </div>
            </li>
          ))}
          {!tersaring.length ? (
            <li className="kosong">{data.transaksi.length ? "Tidak ada catatan yang cocok." : "Belum ada transaksi."}</li>
          ) : null}
        </ul>
        {totalHalaman > 1 ? (
          <div className="baris-antara" style={{ marginTop: 12 }}>
            <button type="button" onClick={() => setHalaman((h) => Math.max(1, h - 1))} disabled={halamanAman <= 1}>
              Sebelumnya
            </button>
            <span className="muted kecil">
              Halaman {halamanAman} dari {totalHalaman}
            </span>
            <button
              type="button"
              onClick={() => setHalaman((h) => Math.min(totalHalaman, h + 1))}
              disabled={halamanAman >= totalHalaman}
            >
              Berikutnya
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function Pos({
  data,
  kirim,
  sibuk,
}: {
  data: DashboardData;
  kirim: (url: string, method: string, body?: unknown) => Promise<boolean>;
  sibuk: boolean;
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
    if (!window.confirm(`Nonaktifkan pos ${p.nama}?`)) return;
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
          <button type="button" className="utama lebar" onClick={() => void tambah()} disabled={sibuk || !nama}>
            Tambah pos
          </button>
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
            <button type="button" className="sekunder" onClick={() => void gantiNama()} disabled={sibuk || !pilih}>
              Ganti nama
            </button>
          </div>
          <div className="baris-tombol">
            <input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="Alias baru" />
            <button type="button" className="sekunder" onClick={() => void tambahAlias()} disabled={sibuk || !pilih}>
              Tambah alias
            </button>
          </div>
          <button type="button" className="hapus lebar" onClick={() => void nonaktifkan()} disabled={sibuk || !pilih}>
            Nonaktifkan pos
          </button>
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
            <button type="button" className="utama lebar" onClick={() => void simpanSetup()} disabled={sibuk}>
              Simpan setup
            </button>
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
}: {
  data: DashboardData;
  kirim: (url: string, method: string, body?: unknown) => Promise<boolean>;
  sibuk: boolean;
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
    if (!window.confirm(`Batalkan target "${nama}"?`)) return;
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
          <button
            type="button"
            className="utama lebar"
            onClick={() => void tambah()}
            disabled={sibuk || !nama || !targetNominal}
          >
            Simpan
          </button>
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
                    <button type="button" className="utama" onClick={() => void nabung(g.id)} disabled={sibuk}>
                      Nabung
                    </button>
                  </div>
                </div>
              </div>
              <div className="transaksi-kanan">
                <button type="button" className="hapus" onClick={() => void batal(g.id, g.nama)} disabled={sibuk}>
                  Batal
                </button>
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
}: {
  data: DashboardData;
  kirim: (url: string, method: string, body?: unknown) => Promise<boolean>;
  sibuk: boolean;
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
    if (!window.confirm(`Batalkan catatan "${nama}"?`)) return;
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
          <button
            type="button"
            className="utama lebar"
            onClick={() => void tambah()}
            disabled={sibuk || !nama || !nominal}
          >
            Simpan
          </button>
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
                    {d.jatuhTempo ? ` A� tempo ${d.jatuhTempo}${d.lewatTempo ? " (lewat)" : ""}` : ""}
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
                    <button type="button" className="sekunder" onClick={() => void bayar(d.id, false)} disabled={sibuk}>
                      Bayar
                    </button>
                    <button type="button" className="utama" onClick={() => void bayar(d.id, true)} disabled={sibuk}>
                      Lunas
                    </button>
                  </div>
                </div>
              </div>
              <div className="transaksi-kanan">
                <button type="button" className="hapus" onClick={() => void batal(d.id, d.nama)} disabled={sibuk}>
                  Batal
                </button>
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
                      {rp(d.nominal)} A� {d.status === "lunas" ? "lunas" : "dibatalkan"}
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
