import { Fragment, useMemo, useState } from "react";
import type { DashboardData } from "@/lib/dashboard";
import { BULAN_PENDEK, labelBulan, mundurBulan, rp, tanggalPendek } from "./format";
import { IkonKeluar, IkonMasuk, IkonRekap, IkonTarget, IkonTransaksi } from "./ikon";
import type { Tab } from "./tipe";

const WARNA_DONUT = ["#173e35", "#b9f27c", "#8fae9a", "#d7e7c4", "#e8f0dd"];

function persen(sekarang: number, sebelumnya: number): number | null {
  if (sebelumnya <= 0) return null;
  return Math.round(((sekarang - sebelumnya) / sebelumnya) * 1000) / 10;
}

function Pill({ nilai, jenis }: { nilai: number | null; jenis: "naik" | "turun" }) {
  if (nilai === null) return <span className="dh-pill netral">Baru</span>;
  const positif = nilai >= 0;
  return (
    <span className={`dh-pill ${jenis === "naik" ? (positif ? "hijau" : "merah") : positif ? "merah" : "hijau"}`}>
      {positif ? "+" : ""}{nilai}%
    </span>
  );
}

export function Ringkasan({
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
  const [rentang, setRentang] = useState(6);
  const [tahun, bulan] = data.hariIni.split("-").map(Number);
  const bulanLalu = mundurBulan(tahun, bulan, 1);

  const txBulanLalu = useMemo(
    () => data.transaksi.filter((t) => t.status === "berlaku" && t.tanggal.startsWith(bulanLalu)),
    [data.transaksi, bulanLalu],
  );
  const masukLalu = txBulanLalu.filter((t) => t.tipe === "in" || t.tipe === "gaji" || t.tipe === "bonus").reduce((s, t) => s + t.nominal, 0);
  const keluarLalu = txBulanLalu.filter((t) => t.tipe === "out").reduce((s, t) => s + t.nominal + t.biayaAdmin, 0);
  const deltaMasuk = persen(r.pendapatanBulanIni, masukLalu);
  const deltaKeluar = persen(r.pengeluaranBulanIni, keluarLalu);
  const deltaTabungan = persen(r.tabungan, data.pengaturan.tabunganAwal);

  const arus = useMemo(
    () =>
      Array.from({ length: rentang }, (_, i) => {
        const kunci = mundurBulan(tahun, bulan, rentang - 1 - i);
        const isi = data.transaksi.filter((t) => t.status === "berlaku" && t.tanggal.startsWith(kunci));
        return {
          kunci,
          masuk: isi.filter((t) => t.tipe === "in" || t.tipe === "gaji" || t.tipe === "bonus").reduce((s, t) => s + t.nominal, 0),
          keluar: isi.filter((t) => t.tipe === "out").reduce((s, t) => s + t.nominal + t.biayaAdmin, 0),
        };
      }),
    [data.transaksi, tahun, bulan, rentang],
  );
  const puncak = arus.reduce((maks, a) => Math.max(maks, a.masuk, a.keluar), 1);
  const puncakIdx = arus.reduce((idx, a, i) => (Math.max(a.masuk, a.keluar) > Math.max(arus[idx].masuk, arus[idx].keluar) ? i : idx), 0);

  const kategori = useMemo(() => {
    const dasar = data.grup
      .map((g) => ({ nama: g.nama, total: g.terpakai }))
      .filter((k) => k.total > 0)
      .sort((a, b) => b.total - a.total);
    const total = dasar.reduce((s, k) => s + k.total, 0);
    const utama = dasar.slice(0, 4);
    const sisa = dasar.slice(4).reduce((s, k) => s + k.total, 0);
    const items = sisa > 0 ? [...utama, { nama: "Lainnya", total: sisa }] : utama;
    return { total, items: items.map((k) => ({ ...k, porsi: total > 0 ? k.total / total : 0 })) };
  }, [data.grup]);

  const donut = useMemo(() => {
    let derajat = 0;
    return kategori.items
      .map((k, i) => {
        const mulai = derajat;
        derajat += k.porsi * 360;
        return `${WARNA_DONUT[i % WARNA_DONUT.length]} ${mulai}deg ${derajat}deg`;
      })
      .join(", ");
  }, [kategori]);

  const goals = data.goals.filter((g) => g.status === "aktif").slice(0, 3);
  const terbaru = data.transaksi.slice(0, 5);
  const limit = data.sisaAman;
  const persenLimit = limit && limit.perHari > 0 ? Math.min(100, Math.round((limit.rataHarian / limit.perHari) * 100)) : 0;

  const aktivitas = useMemo(() => {
    const daftar = [
      ...data.goals.slice(0, 2).map((g) => ({ id: `g${g.id}`, teks: `Target ${g.nama} dibuat`, waktu: g.tanggal })),
      ...data.piutang.slice(0, 2).map((d) => ({
        id: `d${d.id}`,
        teks: `${d.jenis === "piutang" ? "Piutang" : "Utang"} ${d.nama} dicatat`,
        waktu: d.tanggal,
      })),
      ...data.otomatis
        .filter((o) => o.terakhirJalan)
        .slice(0, 2)
        .map((o) => ({ id: `o${o.id}`, teks: `Aturan ${o.nama} dijalankan`, waktu: o.terakhirJalan as string })),
    ];
    return daftar.sort((a, b) => (a.waktu < b.waktu ? 1 : -1)).slice(0, 4);
  }, [data.goals, data.piutang, data.otomatis]);

  return (
    <div className="dh">
      <section className="dh-hero">
        <div className="dh-hero-top">
          <span className="dh-logo">
            <img src="/icon-192.png" alt="" width={26} height={26} />
          </span>
          <span className="dh-signal" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 12a11 11 0 0 1 16 0" />
              <path d="M7.5 15.5a6.5 6.5 0 0 1 9 0" />
              <circle cx="12" cy="19" r="1" fill="currentColor" />
            </svg>
          </span>
        </div>
        <p className="dh-nama">{nama || "Money-Charger"}</p>
        <div className="dh-hero-bawah">
          <div>
            <p className="dh-label">Saldo</p>
            <p className="dh-saldo">{rp(r.saldo)}</p>
          </div>
          <div className="dh-mini">
            <div>
              <span>Sisa/hari</span>
              <b>{rp(limit?.perHari ?? 0)}</b>
            </div>
            <div>
              <span>Hari</span>
              <b>{limit?.hariTersisa ?? 0}</b>
            </div>
          </div>
        </div>
      </section>

      <div className="dh-aksi">
        <button type="button" onClick={() => catat("in")}>
          <span className="dh-ikon"><IkonMasuk aktif={false} /></span>
          <span>Masuk</span>
        </button>
        <button type="button" onClick={() => catat("out")}>
          <span className="dh-ikon"><IkonKeluar aktif={false} /></span>
          <span>Keluar</span>
        </button>
        <button type="button" onClick={() => navigasi("riwayat")}>
          <span className="dh-ikon"><IkonTransaksi aktif={false} /></span>
          <span>Riwayat</span>
        </button>
        <button type="button" onClick={() => navigasi("rekap")}>
          <span className="dh-ikon"><IkonRekap aktif={false} /></span>
          <span>Rekap</span>
        </button>
      </div>

      <div className="dh-ringkas">
        <article className="dh-kartu dh-ringkas-item">
          <span className="dh-ikon"><IkonMasuk aktif={false} /></span>
          <div className="dh-ringkas-teks">
            <p className="dh-angka">{rp(r.pendapatanBulanIni)}</p>
            <p className="dh-sub">Total pemasukan</p>
          </div>
          <Pill nilai={deltaMasuk} jenis="naik" />
          <button type="button" className="dh-dots" aria-label="Detail pemasukan" onClick={() => navigasi("rekap")}>⋯</button>
        </article>
        <article className="dh-kartu dh-ringkas-item">
          <span className="dh-ikon"><IkonKeluar aktif={false} /></span>
          <div className="dh-ringkas-teks">
            <p className="dh-angka">{rp(r.pengeluaranBulanIni)}</p>
            <p className="dh-sub">Total pengeluaran</p>
          </div>
          <Pill nilai={deltaKeluar} jenis="turun" />
          <button type="button" className="dh-dots" aria-label="Detail pengeluaran" onClick={() => navigasi("riwayat")}>⋯</button>
        </article>
        <article className="dh-kartu dh-ringkas-item">
          <span className="dh-ikon"><IkonTarget aktif={false} /></span>
          <div className="dh-ringkas-teks">
            <p className="dh-angka">{rp(r.tabungan)}</p>
            <p className="dh-sub">Total tabungan</p>
          </div>
          <Pill nilai={deltaTabungan} jenis="naik" />
          <button type="button" className="dh-dots" aria-label="Detail tabungan" onClick={() => navigasi("target")}>⋯</button>
        </article>
      </div>

      <section className="dh-kartu">
        <div className="dh-head">
          <h2>Arus kas</h2>
          <select className="dh-pilih" value={rentang} onChange={(e) => setRentang(Number(e.target.value))} aria-label="Rentang arus kas">
            <option value={6}>6 bulan</option>
            <option value={12}>12 bulan</option>
          </select>
        </div>
        <p className="dh-sub">Total saldo</p>
        <div className="dh-cash-total">
          <b>{rp(r.saldo)}</b>
          <span className="dh-legenda">
            <i className="gelap" /> Masuk
            <i className="lime" /> Keluar
          </span>
        </div>
        <div className="dh-chart">
          {arus.map((a, i) => (
            <div className="dh-chart-kolom" key={a.kunci}>
              <div className="dh-chart-batang">
                <span className="masuk" style={{ height: `${Math.max(3, (a.masuk / puncak) * 100)}%` }} />
                <span className="keluar" style={{ height: `${Math.max(3, (a.keluar / puncak) * 100)}%` }} />
              </div>
              <span className="dh-chart-label">{BULAN_PENDEK[Number(a.kunci.slice(5)) - 1]}</span>
              {i === puncakIdx ? (
                <span className={`dh-tooltip${i === 0 ? " kiri" : i === arus.length - 1 ? " kanan" : ""}`}>
                  <b>{labelBulan(a.kunci)}</b>
                  <span>Masuk {rp(a.masuk)}</span>
                  <span>Keluar {rp(a.keluar)}</span>
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      {limit ? (
        <section className="dh-kartu">
          <div className="dh-head">
            <h2>Batas harian</h2>
          </div>
          <div className="dh-limit">
            <p><b>{rp(limit.perHari)}</b> <span className="dh-sub">dari {rp(r.sisaUang)}</span></p>
            <b className="dh-persen">{persenLimit}%</b>
          </div>
          <div className="dh-bar"><span style={{ width: `${Math.max(3, persenLimit)}%` }} /></div>
        </section>
      ) : null}

      <section className="dh-kartu">
        <div className="dh-head">
          <h2>Rencana tabungan</h2>
          <button type="button" className="dh-tautan" onClick={() => navigasi("target")}>+ Tambah</button>
        </div>
        <p className="dh-sub">Total terkumpul</p>
        <p className="dh-angka besar">{rp(r.goalTerkumpulAktif)}</p>
        <ul className="dh-goal">
          {goals.map((g) => (
            <li key={g.id}>
              <div className="dh-goal-head">
                <span className="dh-ikon kecil"><IkonTarget aktif={false} /></span>
                <b>{g.nama}</b>
                <button type="button" className="dh-dots" aria-label={`Detail ${g.nama}`} onClick={() => navigasi("target")}>⋯</button>
              </div>
              <div className="dh-bar"><span style={{ width: `${Math.max(2, Math.round(g.progres * 100))}%` }} /></div>
              <div className="dh-goal-kaki">
                <span>{rp(g.terkumpul)} <b>{Math.round(g.progres * 100)}%</b></span>
                <span>Target {rp(g.targetNominal)}</span>
              </div>
            </li>
          ))}
          {!goals.length ? <li className="dh-sub">Belum ada rencana tabungan aktif.</li> : null}
        </ul>
      </section>

      <section className="dh-kartu">
        <div className="dh-head">
          <h2>Statistik</h2>
          <span className="dh-pilih statis">Bulan ini</span>
        </div>
        <div className="dh-donut">
          <div className="dh-donut-cincin" style={{ background: kategori.total > 0 ? `conic-gradient(${donut})` : "#e8f0dd" }}>
            <div>
              <span>Total pengeluaran</span>
              <b>{rp(kategori.total)}</b>
            </div>
          </div>
        </div>
        <ul className="dh-stat">
          {kategori.items.map((k, i) => (
            <li key={k.nama}>
              <span className="dh-chip" style={{ background: WARNA_DONUT[i % WARNA_DONUT.length] }}>
                {Math.round(k.porsi * 100)}%
              </span>
              <span>{k.nama}</span>
              <b>{rp(k.total)}</b>
            </li>
          ))}
          {!kategori.items.length ? <li className="dh-sub">Belum ada pengeluaran bulan ini.</li> : null}
        </ul>
      </section>

      <section className="dh-kartu">
        <div className="dh-head">
          <h2>Transaksi terakhir</h2>
          <button type="button" className="dh-tautan" onClick={() => navigasi("riwayat")}>Semua</button>
        </div>
        <div className="dh-tabel-head">
          <span>Transaksi</span>
          <span>Tanggal</span>
          <span className="kanan">Nominal</span>
        </div>
        <ul className="dh-tabel">
          {terbaru.map((t) => {
            const keluar = t.tipe === "out";
            const judul = t.subPost ?? t.label ?? "Tanpa pos";
            return (
              <li key={t.id} onClick={() => navigasi("riwayat")} role="button" tabIndex={0}>
                <div className="dh-tx">
                  <span className={keluar ? "dh-avatar" : "dh-avatar masuk"}>{(judul.trim().charAt(0) || "?").toUpperCase()}</span>
                  <div>
                    <b>{judul}</b>
                    <p>{t.tags.length ? `#${t.tags[0]}` : keluar ? "Pengeluaran" : "Pemasukan"}</p>
                  </div>
                </div>
                <span className="dh-tx-tanggal">{tanggalPendek(t.tanggal)}</span>
                <div className="dh-tx-nilai">
                  <b className={keluar ? "keluar" : "masuk"}>{keluar ? "−" : "+"} {rp(keluar ? t.nominal + t.biayaAdmin : t.nominal)}</b>
                  <span className={`dh-status ${t.status === "batal" ? "pending" : "selesai"}`}>
                    {t.status === "batal" ? "Batal" : "Selesai"}
                  </span>
                </div>
              </li>
            );
          })}
          {!terbaru.length ? <li className="dh-sub">Belum ada transaksi.</li> : null}
        </ul>
      </section>

      <section className="dh-kartu">
        <div className="dh-head">
          <h2>Aktivitas terbaru</h2>
          <span className="dh-sub">Ringkasan</span>
        </div>
        <ul className="dh-aktivitas">
          {aktivitas.map((a, i) => (
            <Fragment key={a.id}>
              {i === 0 || (a.waktu === data.hariIni) !== (aktivitas[i - 1].waktu === data.hariIni) ? (
                <li className="dh-grup">{a.waktu === data.hariIni ? "Hari ini" : "Sebelumnya"}</li>
              ) : null}
              <li>
                <span className="dh-avatar">{(a.teks.trim().charAt(0) || "?").toUpperCase()}</span>
                <div>
                  <b>{a.teks}</b>
                  <p>{a.waktu === data.hariIni ? "Hari ini" : tanggalPendek(a.waktu)}</p>
                </div>
              </li>
            </Fragment>
          ))}
          {!aktivitas.length ? <li className="dh-sub">Belum ada aktivitas.</li> : null}
        </ul>
      </section>

      <footer className="dh-kaki">
        <p>© 2026 Money-Charger</p>
        <p className="dh-sub">Pencatatan keuangan pribadi · tersinkron otomatis</p>
      </footer>
    </div>
  );
}
