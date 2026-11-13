import { Tombol } from "@/components/tombol";
import type { DashboardData } from "@/lib/dashboard";
import { rp } from "./format";
import type { Kirim } from "./tipe";

export function Wawasan({ data, kirim, sibuk }: { data: DashboardData; kirim: Kirim; sibuk: boolean }) {
  const w = data.wawasan;
  const kategori = data.perubahanKategori;

  return (
    <div className="cn-halaman">
      <article className="saldo-kartu cn-span wawasan-hero">
        <div className="saldo-teks">
          <p className="saldo-label">Kesehatan finansial</p>
          <p className="saldo-angka">{w.label}</p>
          <p className="saldo-sub">Dihitung dari anggaran, tabungan, dana darurat, dan arus saldo.</p>
        </div>
        <div
          className="skor-bulat terang"
          style={{ background: `conic-gradient(#c8f58a ${w.skor * 3.6}deg, rgba(255,255,255,.18) 0)` }}
          role="img"
          aria-label={`Skor kesehatan finansial ${w.skor} dari 100`}
        >
          <div>
            <b>{w.skor}</b>
            <span>/100</span>
          </div>
        </div>
      </article>

      <div className="stat-row cn-span">
        <article className="stat-kartu">
          <p className="stat-label">Proyeksi pengeluaran</p>
          <p className="angka">{rp(w.proyeksiPengeluaran)}</p>
          <p className="muted kecil">Kecepatan belanja sampai hari ini</p>
        </article>
        <article className="stat-kartu">
          <p className="stat-label">Proyeksi saldo akhir</p>
          <p className={`angka ${w.proyeksiSaldo < 0 ? "delta-naik" : "delta-turun"}`}>{rp(w.proyeksiSaldo)}</p>
          <p className="muted kecil">Jika pola belanja berlanjut</p>
        </article>
        <article className="stat-kartu">
          <p className="stat-label">Rasio tabungan</p>
          <p className="angka">{Math.round(w.rasioTabungan * 100)}%</p>
          <p className="muted kecil">Bagian dari total rencana</p>
        </article>
      </div>

      <section className="kartu">
        <div className="baris-antara">
          <h2>Peringatan</h2>
          <span className={`badge ${w.peringatan.length ? "tipe-out" : "hijau"}`}>
            {w.peringatan.length ? `${w.peringatan.length} hal` : "Aman"}
          </span>
        </div>
        <ul className="cn-daftar-pil">
          {w.peringatan.map((item) => (
            <li key={item}>{item}</li>
          ))}
          {!w.peringatan.length ? <li className="muted kecil">Tidak ada peringatan penting saat ini.</li> : null}
        </ul>
      </section>

      <section className="kartu">
        <div className="baris-antara">
          <h2>Anomali &amp; kebocoran</h2>
          <span className={`badge ${w.anomali.length ? "tipe-out" : "hijau"}`}>
            {w.anomali.length ? `${w.anomali.length} temuan` : "Tidak ada"}
          </span>
        </div>
        <ul className="cn-daftar-pil">
          {w.anomali.map((item) => (
            <li key={item}>{item}</li>
          ))}
          {!w.anomali.length ? <li className="muted kecil">Belum ada anomali menonjol.</li> : null}
        </ul>
      </section>

      <section className="kartu">
        <h2>Yang perlu diperhatikan</h2>
        <ul className="cn-daftar-pil">
          {w.faktor.map((faktor) => (
            <li key={faktor}>{faktor}</li>
          ))}
        </ul>
      </section>

      <section className="kartu">
        <div className="baris-antara">
          <h2>Langganan terdeteksi</h2>
          <span className="badge">{rp(w.totalLangganan)}/bulan</span>
        </div>
        <ul className="cn-legend">
          {w.langganan.map((item) => (
            <li key={`${item.nama}-${item.terakhir}`}>
              <span className="avatar-uang masuk">{(item.nama.trim().charAt(0) || "?").toUpperCase()}</span>
              <span>
                {item.nama}
                <small className="muted kecil blok">Terakhir {item.terakhir} · berikutnya {item.perkiraanBerikut}</small>
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
        <h2>Perubahan kategori</h2>
        <ul className="cn-legend">
          {kategori.map((item) => (
            <li key={item.nama}>
              <span className={`badge ${item.delta > 0 ? "tipe-out" : "hijau"}`}>{item.delta > 0 ? "Naik" : "Turun"}</span>
              <span>{item.nama}</span>
              <b className={item.delta > 0 ? "delta-naik" : "delta-turun"}>
                {item.delta > 0 ? "+" : ""}{rp(item.delta)}
              </b>
            </li>
          ))}
          {!kategori.length ? <li className="muted kecil">Belum ada perubahan yang menonjol.</li> : null}
        </ul>
      </section>
    </div>
  );
}
