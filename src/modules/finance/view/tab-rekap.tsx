import { useMemo } from "react";
import { Tombol } from "@/components/tombol";
import type { DashboardData } from "@/lib/dashboard";
import { BULAN_PENDEK, labelBulan, mundurBulan, rp } from "./format";
import { BarisTransaksi, GrafikArea } from "./komponen";
import type { Tab } from "./tipe";

export function Rekap({ data, navigasi }: { data: DashboardData; navigasi: (tab: Tab) => void }) {
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

      <section className="kartu rekap-kategori">
        <div className="baris-antara">
          <h2>Perubahan Kategori</h2>
          <span className="muted kecil">
            vs {labelBulan(mundurBulan(Number(bulanIni.slice(0, 4)), Number(bulanIni.slice(5, 7)), 1))}
          </span>
        </div>
        <ul>
          {data.perubahanKategori.map((item) => (
            <li key={item.nama}>
              <span>{item.nama}</span>
              <span className={item.delta > 0 ? "delta-naik" : "delta-turun"}>
                {item.delta > 0 ? "+" : ""}
                {rp(item.delta)}
              </span>
            </li>
          ))}
          {!data.perubahanKategori.length ? (
            <li className="muted kecil">Belum ada perubahan pengeluaran yang menonjol.</li>
          ) : null}
        </ul>
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
