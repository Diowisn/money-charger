import { Tombol } from "@/components/tombol";
import type { DashboardData } from "@/lib/dashboard";
import { rp } from "./format";
import type { Kirim } from "./tipe";

export function Wawasan({ data, kirim, sibuk }: { data: DashboardData; kirim: Kirim; sibuk: boolean }) {
  const w = data.wawasan;
  const kategori = data.perubahanKategori;

  return (
    <div className="wawasan">
      <section className="kartu wawasan-skor">
        <div>
          <span className="badge hijau">Wawasan</span>
          <h2>Kesehatan Finansial</h2>
          <p className="wawasan-predikat">{w.label}</p>
          <p className="muted kecil">Dihitung dari anggaran, tabungan, dana darurat, dan arus saldo.</p>
        </div>
        <div
          className="skor-bulat"
          style={{ background: `conic-gradient(var(--hijau) ${w.skor * 3.6}deg, var(--garis) 0)` }}
          role="img"
          aria-label={`Skor kesehatan finansial ${w.skor} dari 100`}
        >
          <div>
            <b>{w.skor}</b>
            <span>/100</span>
          </div>
        </div>
      </section>

      <section className="wawasan-grid">
        <div className="kartu wawasan-metrik">
          <p className="muted kecil">Proyeksi pengeluaran bulan ini</p>
          <p className="angka">{rp(w.proyeksiPengeluaran)}</p>
          <p className="muted kecil">Berdasarkan kecepatan belanja sampai hari ini.</p>
        </div>
        <div className="kartu wawasan-metrik">
          <p className="muted kecil">Proyeksi saldo akhir bulan</p>
          <p className={`angka ${w.proyeksiSaldo < 0 ? "delta-naik" : "delta-turun"}`}>{rp(w.proyeksiSaldo)}</p>
          <p className="muted kecil">Sisa saldo jika pola pengeluaran berlanjut.</p>
        </div>
        <div className="kartu wawasan-metrik">
          <p className="muted kecil">Rasio tabungan + investasi</p>
          <p className="angka">{Math.round(w.rasioTabungan * 100)}%</p>
          <p className="muted kecil">Bagian dari total rencana periode ini.</p>
        </div>
      </section>

      <section className="kartu">
        <div className="baris-antara">
          <h2>Peringatan</h2>
          <span className={`badge ${w.peringatan.length ? "tipe-out" : "hijau"}`}>{w.peringatan.length ? `${w.peringatan.length} hal` : "Aman"}</span>
        </div>
        <ul className="wawasan-daftar">
          {w.peringatan.map((item) => (
            <li key={item}>{item}</li>
          ))}
          {!w.peringatan.length ? <li className="muted kecil">Tidak ada peringatan penting saat ini.</li> : null}
        </ul>
      </section>

      <section className="kartu">
        <h2>Yang perlu diperhatikan</h2>
        <ul className="wawasan-daftar">
          {w.faktor.map((faktor) => (
            <li key={faktor}>{faktor}</li>
          ))}
        </ul>
      </section>

      <section className="kartu">
        <div className="baris-antara">
          <h2>Langganan Terdeteksi</h2>
          <span className="badge">{rp(w.totalLangganan)}/bulan</span>
        </div>
        <ul className="wawasan-daftar">
          {w.langganan.map((item) => (
            <li key={`${item.nama}-${item.terakhir}`} className="baris-antara">
              <span>
                <b>{item.nama}</b>
                <small className="muted"> · terakhir {item.terakhir}, berikutnya sekitar {item.perkiraanBerikut}</small>
              </span>
              <b>{rp(item.nominal)}</b>
            </li>
          ))}
          {!w.langganan.length ? (
            <li className="muted kecil">Belum ada pola langganan bulanan yang terdeteksi.</li>
          ) : null}
        </ul>
      </section>

      <section className="kartu">
        <div className="baris-antara">
          <h2>Digest WhatsApp</h2>
          <span className={`badge ${data.pengaturan.digestAktif ? "hijau" : ""}`}>
            {data.pengaturan.digestAktif ? "Aktif" : "Mati"}
          </span>
        </div>
        <p className="muted kecil">
          Ringkasan mingguan dan peringatan anggaran/tagihan dikirim ke nomor WhatsApp pemilik yang terverifikasi.
        </p>
        <Tombol
          varian="sekunder"
          onClick={() => void kirim("/api/pengaturan", "POST", { digestAktif: !data.pengaturan.digestAktif })}
          disabled={sibuk}
        >
          {data.pengaturan.digestAktif ? "Matikan digest" : "Aktifkan digest"}
        </Tombol>
      </section>

      <section className="kartu">
        <h2>Perubahan Kategori</h2>
        <ul className="wawasan-daftar">
          {kategori.map((item) => (
            <li key={item.nama} className="baris-antara">
              <span>{item.nama}</span>
              <b className={item.delta > 0 ? "delta-naik" : "delta-turun"}>
                {item.delta > 0 ? "+" : ""}
                {rp(item.delta)}
              </b>
            </li>
          ))}
          {!kategori.length ? <li className="muted kecil">Belum ada perubahan yang menonjol.</li> : null}
        </ul>
      </section>
    </div>
  );
}
