"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DashboardData } from "@/lib/dashboard";

type Pesan = { jenis: "ok" | "error"; teks: string };
type Tab = "ringkasan" | "rencana" | "transaksi" | "pos";
type StatusLive = "hidup" | "terputus";

const INTERVAL_LIVE_MS = 5000;

const WARNA = ["#2f9e6b", "#4f8ef7", "#f2a33c", "#c26bd8", "#e05d5d", "#3aa6b9", "#8a7d3d"];
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

function drafRencana(data: DashboardData): Record<string, number> {
  const d: Record<string, number> = {
    dd: data.rencanaLain.dd,
    tabungan: data.rencanaLain.tabungan,
    investasi: data.rencanaLain.investasi,
  };
  for (const p of data.posSemua) if (p.aktif) d[`s:${p.id}`] = p.jatahRencana;
  return d;
}

export default function Dashboard({ awal }: { awal: DashboardData }) {
  const [data, setData] = useState(awal);
  const [tab, setTab] = useState<Tab>("ringkasan");
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<Pesan | null>(null);
  const [buka, setBuka] = useState<Record<number, boolean>>(() => ({ [awal.grup[0]?.id ?? 0]: true }));
  const [statusLive, setStatusLive] = useState<StatusLive>("hidup");
  const [terakhir, setTerakhir] = useState<number | null>(null);
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

  async function keluar() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
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
      <header className="topbar">
        <div>
          <p className="eyebrow">Money-Charger</p>
          <h1>{data.periode.aktif ? "Periode aktif" : "Periode awal"}</h1>
          <p className="muted">
            {data.periode.aktif
              ? `Hari ke-${data.periode.hariKe} · mulai ${data.periode.mulai}${
                  data.periode.akhir ? ` · sampai ${data.periode.akhir}` : ""
                }`
              : `Hari ini ${data.hariIni}`}
          </p>
        </div>
        <div className="topbar-aksi">
          <span
            className={`status-live ${statusLive}`}
            role="status"
            aria-live="polite"
            title={statusLive === "hidup" ? "Data tersinkron otomatis" : "Koneksi terputus"}
          >
            <i />
            {statusLive === "hidup" ? "Live" : "Terputus"}
          </span>
          <button className="ghost" onClick={keluar} type="button">
            Keluar
          </button>
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
      </main>

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

  return (
    <div className="tumpuk">
      <section className="kartu sorot">
        <div className="baris-antara">
          <div>
            <p className="label">Sisa Uang</p>
            <p className="angka-besar">{rp(r.sisaUang)}</p>
            <p className="muted">Potensi Dana Darurat &amp; Investasi Diri</p>
          </div>
          <div
            className="cincin"
            style={{ background: `conic-gradient(var(--hijau) ${r.rasio * 100}%, var(--garis) 0)` }}
          >
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

      <section className="kartu">
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
    <div className="tumpuk">
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
        <section className="kartu" key={g.id}>
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
  const [tanggal, setTanggal] = useState(data.hariIni);
  const [label, setLabel] = useState("");
  const [subPostId, setSubPostId] = useState("");
  const [wadah, setWadah] = useState("saldo");
  const [wadahAsal, setWadahAsal] = useState("tabungan");
  const [wadahTujuan, setWadahTujuan] = useState("saldo");
  const [paksa, setPaksa] = useState(false);

  const posAktif = data.posSemua.filter((p) => p.aktif);

  async function simpan() {
    const body: Record<string, unknown> = { tipe, nominal: Number(nominal), tanggal, label: label || null };
    if (tipe === "out") body.subPostId = subPostId ? Number(subPostId) : null;
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
    }
  }

  async function hapus(id: number, teks: string) {
    if (!window.confirm(`Batalkan ${teks}?`)) return;
    await kirim("/api/transactions", "DELETE", { id });
  }

  return (
    <div className="tumpuk">
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
          <span className="muted kecil">{data.transaksi.length} catatan terakhir</span>
        </div>
        <ul className="daftar-transaksi">
          {data.transaksi.map((t) => (
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
                    {t.wadahAsal ? ` · dari ${NAMA_WADAH[t.wadahAsal]}` : ""}
                    {t.status === "batal" ? " · dibatalkan" : ""}
                  </p>
                </div>
              </div>
              <div className="transaksi-kanan">
                <b>{rp(t.nominal)}</b>
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
          {!data.transaksi.length ? <li className="kosong">Belum ada transaksi.</li> : null}
        </ul>
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
    <div className="tumpuk">
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
        <section className="kartu">
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
        <section className="kartu">
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
