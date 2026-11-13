import { Tombol } from "@/components/tombol";
import type { DashboardData } from "@/lib/dashboard";
import { BULAN_PENDEK, rp, tanggalPendek } from "./format";
import { IkonKeluar, IkonMasuk, IkonRekap, IkonTarget, IkonTransaksi, IkonWawasan, SaldoIlustrasi } from "./ikon";
import { BarisTransaksi, GrafikArea } from "./komponen";
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
  const w = data.wawasan;
  const terbaru = data.transaksi.filter((t) => t.status === "berlaku").slice(0, 5);
  const aman = data.sisaAman;
  const kategori = data.perubahanKategori.slice(0, 5);
  const totalKategori = Math.max(1, kategori.reduce((s, k) => s + Math.abs(k.sekarang), 0));
  const goals = data.goals.filter((g) => g.status === "aktif").slice(0, 3);
  const dompet = data.dompet.daftar.slice(0, 2);
  const skor = w.skor;

  return (
    <div className="cn-dash">
      <section className="cn-kiri">
        <article className="saldo-kartu">
          <div className="saldo-teks">
            <p className="saldo-label">Total saldo</p>
            <p className="saldo-angka">{rp(r.saldo)}</p>
            <p className="saldo-sub">{nama || "Money-Charger"} · {data.periode.aktif ? `hari ke-${data.periode.hariKe}` : "periode awal"}</p>
          </div>
          <SaldoIlustrasi />
        </article>

        <div className="aksi-cepat" aria-label="Aksi cepat">
          <button type="button" onClick={() => catat("in")}><span className="aksi-ikon masuk"><IkonMasuk aktif={false} /></span><span>Pemasukan</span></button>
          <button type="button" onClick={() => catat("out")}><span className="aksi-ikon keluar"><IkonKeluar aktif={false} /></span><span>Pengeluaran</span></button>
          <button type="button" onClick={() => navigasi("riwayat")}><span className="aksi-ikon"><IkonTransaksi aktif={false} /></span><span>Transaksi</span></button>
          <button type="button" onClick={() => navigasi("rekap")}><span className="aksi-ikon"><IkonRekap aktif={false} /></span><span>Rekap</span></button>
        </div>

        {aman ? (
          <article className="kartu sisa-aman">
            <div className="baris-antara">
              <h2>Batas harian</h2>
              <span className={`badge ${aman.perHari >= aman.rataHarian ? "tipe-in" : "tipe-out"}`}>
                {aman.perHari >= aman.rataHarian ? "Aman" : "Ketat"}
              </span>
            </div>
            <p className="angka">{rp(aman.perHari)}<span className="muted kecil"> /hari</span></p>
            <p className="muted kecil">{rp(aman.rataHarian)} rata belanja · sisa {rp(r.sisaUang)} untuk {aman.hariTersisa} hari</p>
            <div className="bar tebal"><span style={{ width: `${Math.min(100, Math.round((aman.rataHarian / Math.max(1, aman.perHari || 1)) * 100))}%` }} /></div>
          </article>
        ) : null}

        <article className="kartu">
          <div className="baris-antara">
            <h2>Target</h2>
            <Tombol varian="tautan" onClick={() => navigasi("target")}>Tambah</Tombol>
          </div>
          <p className="angka">{rp(r.goalTerkumpulAktif)}</p>
          <p className="muted kecil">dari target {rp(r.goalTargetAktif)}</p>
          <ul className="cn-rencana">
            {goals.map((g) => (
              <li key={g.id}>
                <div className="baris-antara"><b>{g.nama}</b><span className="muted kecil">{Math.round(g.progres * 100)}%</span></div>
                <div className="bar tipis"><span style={{ width: `${Math.round(g.progres * 100)}%` }} /></div>
                <p className="muted kecil">{rp(g.terkumpul)} / {rp(g.targetNominal)}</p>
              </li>
            ))}
            {!goals.length ? <li className="muted kecil">Belum ada target aktif.</li> : null}
          </ul>
        </article>
      </section>

      <section className="cn-tengah">
        <div className="stat-row">
          <article className="stat-kartu">
            <span className="stat-ikon"><IkonMasuk aktif={false} /></span>
            <p className="stat-label">Pemasukan</p>
            <p className="angka">{rp(r.pendapatanBulanIni)}</p>
            <p className="muted kecil">Bulan ini</p>
          </article>
          <article className="stat-kartu">
            <span className="stat-ikon"><IkonKeluar aktif={false} /></span>
            <p className="stat-label">Pengeluaran</p>
            <p className="angka">{rp(r.pengeluaranBulanIni)}</p>
            <p className="muted kecil">Bulan ini</p>
          </article>
          <article className="stat-kartu">
            <span className="stat-ikon"><IkonTarget aktif={false} /></span>
            <p className="stat-label">Tabungan</p>
            <p className="angka">{rp(r.tabungan)}</p>
            <p className="muted kecil">Saldo tersimpan</p>
          </article>
          <article className="stat-kartu">
            <span className="stat-ikon"><IkonWawasan aktif={false} /></span>
            <p className="stat-label">Investasi</p>
            <p className="angka">{rp(r.investasi)}</p>
            <p className="muted kecil">Saldo investasi</p>
          </article>
        </div>

        <article className="kartu">
          <div className="baris-antara">
            <div>
              <h2>Arus kas</h2>
              <p className="angka">{rp(r.saldo)}</p>
            </div>
            <span className="badge">14 hari</span>
          </div>
          <GrafikArea nilai={data.tren.map((t) => t.pengeluaran)} warna="#173e35" label="Pengeluaran 14 hari" />
          <div className="cn-sumbu">
            {data.tren.filter((_, i) => i % 2 === 0).map((t) => (
              <span key={t.tanggal}>{Number(t.tanggal.slice(8))}</span>
            ))}
          </div>
        </article>

        <article className="kartu">
          <div className="baris-antara">
            <h2>Transaksi terakhir</h2>
            <Tombol varian="tautan" onClick={() => navigasi("riwayat")}>Lihat semua</Tombol>
          </div>
          <ul className="daftar-transaksi daftar-rapi">
            {terbaru.map((t) => <BarisTransaksi key={t.id} tx={t} />)}
            {!terbaru.length ? <li className="kosong"><p className="muted">Belum ada transaksi.</p></li> : null}
          </ul>
        </article>
      </section>

      <section className="cn-kanan">
        <article className="kartu">
          <div className="baris-antara"><h2>Skor keuangan</h2><span className="badge hijau">{skor}%</span></div>
          <p className="muted kecil">Kualitas keuangan</p>
          <p className="angka">{w.label}</p>
          <div className="bar tebal"><span style={{ width: `${skor}%` }} /></div>
        </article>

        <article className="kartu">
          <div className="baris-antara"><h2>Dompet</h2><Tombol varian="tautan" onClick={() => navigasi("dompet")}>Kelola</Tombol></div>
          <p className="muted kecil">Total saldo</p>
          <p className="angka">{rp(data.dompet.total)}</p>
          <ul className="cn-dompet">
            {dompet.map((d, i) => (
              <li key={d.id} className={i === 0 ? "gelap" : ""}>
                <b>{d.nama}</b>
                <span>{rp(d.saldo)}</span>
              </li>
            ))}
            {!dompet.length ? <li className="muted kecil">Belum ada dompet.</li> : null}
          </ul>
        </article>

        <article className="kartu">
          <h2>Komposisi pengeluaran</h2>
          <ul className="cn-legend">
            {kategori.map((k) => {
              const persen = Math.round((Math.abs(k.sekarang) / totalKategori) * 100);
              return (
                <li key={k.nama}>
                  <span className="badge">{persen}%</span>
                  <span>{k.nama}</span>
                  <b>{rp(k.sekarang)}</b>
                </li>
              );
            })}
            {!kategori.length ? <li className="muted kecil">Belum ada kategori bulan ini.</li> : null}
          </ul>
        </article>

        <article className="kartu">
          <h2>Aktivitas</h2>
          <ul className="cn-aktivitas">
            {terbaru.slice(0, 4).map((t) => (
              <li key={t.id}>
                <span className="avatar-uang kecil">{(t.subPost ?? t.label ?? "?").charAt(0).toUpperCase()}</span>
                <div>
                  <b>{t.subPost ?? t.label ?? "Transaksi"}</b>
                  <p className="muted kecil">{tanggalPendek(t.tanggal)} · {BULAN_PENDEK[Number(t.tanggal.slice(5, 7)) - 1]}</p>
                </div>
              </li>
            ))}
          </ul>
        </article>
      </section>
    </div>
  );
}
