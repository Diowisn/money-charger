import { Tombol } from "@/components/tombol";
import type { DashboardData } from "@/lib/dashboard";
import { rp } from "./format";
import { IkonKeluar, IkonMasuk, IkonRekap, IkonTarget, IkonTransaksi, IkonWawasan, SaldoIlustrasi } from "./ikon";
import { BarisTransaksi } from "./komponen";
import type { Tab } from "./tipe";

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
  const terbaru = data.transaksi.filter((t) => t.status === "berlaku").slice(0, 6);
  const aman = data.sisaAman;

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

      <section className="stat-row" aria-label="Ringkasan bulan ini">
        <article className="stat-kartu">
          <span className="stat-ikon">
            <IkonMasuk aktif={false} />
          </span>
          <p className="stat-label">Pemasukan</p>
          <p className="angka">{rp(r.pendapatanBulanIni)}</p>
          <p className="muted kecil">Bulan ini</p>
        </article>
        <article className="stat-kartu">
          <span className="stat-ikon">
            <IkonKeluar aktif={false} />
          </span>
          <p className="stat-label">Pengeluaran</p>
          <p className="angka">{rp(r.pengeluaranBulanIni)}</p>
          <p className="muted kecil">Bulan ini</p>
        </article>
        <article className="stat-kartu">
          <span className="stat-ikon">
            <IkonTarget aktif={false} />
          </span>
          <p className="stat-label">Tabungan</p>
          <p className="angka">{rp(r.tabungan)}</p>
          <p className="muted kecil">Saldo tersimpan</p>
        </article>
        <article className="stat-kartu">
          <span className="stat-ikon">
            <IkonWawasan aktif={false} />
          </span>
          <p className="stat-label">Investasi</p>
          <p className="angka">{rp(r.investasi)}</p>
          <p className="muted kecil">Saldo investasi</p>
        </article>
      </section>

      {aman ? (
        <section className="kartu sisa-aman">
          <div className="baris-antara">
            <h2>Sisa Aman</h2>
            <span className={`badge ${aman.perHari >= aman.rataHarian ? "tipe-in" : "tipe-out"}`}>
              {aman.perHari >= aman.rataHarian ? "Aman" : "Ketat"}
            </span>
          </div>
          <p className="angka-besar">
            {rp(aman.perHari)}
            <span className="muted kecil"> /hari</span>
          </p>
          <p className="muted kecil">
            Sisa jatah {rp(r.sisaUang)} untuk {aman.hariTersisa} hari
            {aman.perkiraan ? " (perkiraan 30 hari sejak gaji)" : ""}.
          </p>
          <p className="muted kecil">
            Rata-rata belanja {rp(aman.rataHarian)}/hari
            {aman.habisDalamHari !== null ? ` · saldo cukup sekitar ${aman.habisDalamHari} hari` : ""}.
          </p>
        </section>
      ) : null}

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
