import { useMemo, useState } from "react";
import { Tombol } from "@/components/tombol";
import type { DashboardData } from "@/lib/dashboard";
import { BULAN_PENDEK, labelBulan, mundurBulan, rp } from "./format";
import { BarisTransaksi, GrafikArea } from "./komponen";
import type { Tab } from "./tipe";

export function Rekap({ data, navigasi }: { data: DashboardData; navigasi: (tab: Tab) => void }) {
  const r = data.ringkasan;
  const bulanIni = data.hariIni.slice(0, 7);
  const [rentang, setRentang] = useState(6);
  const daftarBulan = useMemo(() => {
    const [tahun, bulan] = data.hariIni.split("-").map(Number);
    return Array.from({ length: rentang }, (_, i) => mundurBulan(tahun, bulan, rentang - 1 - i));
  }, [data.hariIni, rentang]);

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
  const totalMasuk = agregat.reduce((s, a) => s + a.masuk, 0);
  const totalKeluar = agregat.reduce((s, a) => s + a.keluar, 0);
  const bulanAktif = data.transaksi.filter(
    (t) => t.status === "berlaku" && t.tanggal.startsWith(bulanIni),
  );
  const kategoriMaks = Math.max(1, ...data.perubahanKategori.map((k) => Math.abs(k.delta)));

  return (
    <div className="cn-halaman">
      <article className="saldo-kartu cn-span">
        <div className="saldo-teks">
          <p className="saldo-label">Saldo saat ini</p>
          <p className="saldo-angka">{rp(r.saldo)}</p>
          <div className="cn-hero-mini">
            <span>Masuk <b>{rp(r.pendapatanBulanIni)}</b></span>
            <span>Keluar <b>{rp(r.pengeluaranBulanIni)}</b></span>
            <span>Selisih <b>{rp(r.pendapatanBulanIni - r.pengeluaranBulanIni)}</b></span>
          </div>
        </div>
      </article>

      <section className="kartu">
        <div className="baris-antara">
          <div>
            <h2>Arus kas {rentang} bulan</h2>
            <p className="muted kecil">Masuk {rp(totalMasuk)} · keluar {rp(totalKeluar)}</p>
          </div>
          <select
            className="select-mini"
            aria-label="Rentang rekap"
            value={rentang}
            onChange={(event) => setRentang(Number(event.target.value))}
          >
            <option value={6}>6 bulan</option>
            <option value={12}>12 bulan</option>
            <option value={24}>24 bulan</option>
          </select>
        </div>
        <div className="grafik-batang" role="img" aria-label={`Grafik pemasukan dan pengeluaran ${rentang} bulan`}>
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
              <span className="batang-label">{BULAN_PENDEK[Number(a.kunci.slice(5)) - 1]}{rentang > 12 ? ` ${a.kunci.slice(2, 4)}` : ""}</span>
            </div>
          ))}
        </div>
        <div className="grafik-legenda">
          <span><i className="masuk" /> Pemasukan</span>
          <span><i className="keluar" /> Pengeluaran</span>
        </div>
      </section>

      <section className="kartu">
        <div className="baris-antara">
          <h2>Perubahan kategori</h2>
          <span className="badge">
            vs {labelBulan(mundurBulan(Number(bulanIni.slice(0, 4)), Number(bulanIni.slice(5, 7)), 1))}
          </span>
        </div>
        <ul className="cn-legend">
          {data.perubahanKategori.map((item) => (
            <li key={item.nama}>
              <span className={item.delta > 0 ? "delta-naik" : "delta-turun"}>
                {item.delta > 0 ? "+" : ""}{rp(item.delta)}
              </span>
              <span>{item.nama}</span>
              <span className="cn-track">
                <i style={{ width: `${Math.max(6, Math.round((Math.abs(item.delta) / kategoriMaks) * 100))}%` }} />
              </span>
            </li>
          ))}
          {!data.perubahanKategori.length ? (
            <li className="muted kecil">Belum ada perubahan pengeluaran yang menonjol.</li>
          ) : null}
        </ul>
      </section>

      <section className="kartu cn-span">
        <div className="baris-antara">
          <div>
            <h2>Tren 14 hari</h2>
            <p className="muted kecil">Total pengeluaran {rp(data.tren.reduce((s, t) => s + t.pengeluaran, 0))}</p>
          </div>
          <span className="badge hijau">Harian</span>
        </div>
        <GrafikArea
          nilai={data.tren.map((t) => t.pengeluaran)}
          warna="var(--merah)"
          label="Grafik pengeluaran 14 hari terakhir"
        />
      </section>

      <section className="kartu cn-span">
        <div className="baris-antara">
          <h2>Rekap {labelBulan(bulanIni)}</h2>
          <Tombol varian="tautan" onClick={() => navigasi("riwayat")}>
            Lihat semua
          </Tombol>
        </div>
        <div className="cn-thead">
          <span aria-hidden="true" />
          <span>Transaksi</span>
          <span className="kanan">Nominal</span>
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
