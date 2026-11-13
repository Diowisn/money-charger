import { useEffect, useMemo, useState } from "react";
import { TautanTombol, Tombol } from "@/components/tombol";
import type { DashboardData } from "@/lib/dashboard";
import type { LaporanData } from "@/lib/laporan";
import { addDays } from "@/lib/parse/date";
import { NAMA_TIPE, labelBulan, mundurBulan, rp, tanggalPendek } from "./format";
import type { Kirim } from "./tipe";

interface Preset {
  id: string;
  label: string;
  dari: string;
  sampai: string;
}

interface StatusSheets {
  mode: "google" | "webhook" | null;
  url: string | null;
  spreadsheetUrl: string | null;
  email: string | null;
  terakhir: string | null;
  googleSiap: boolean;
}

function susunPreset(hariIni: string): Preset[] {
  const [tahun, bulan] = hariIni.split("-").map(Number);
  const awalBulanIni = `${hariIni.slice(0, 7)}-01`;
  return [
    { id: "bulan", label: "Bulan ini", dari: awalBulanIni, sampai: hariIni },
    { id: "bulan-lalu", label: "Bulan lalu", dari: `${mundurBulan(tahun, bulan, 1)}-01`, sampai: addDays(awalBulanIni, -1) },
    { id: "tiga-bulan", label: "3 bulan", dari: `${mundurBulan(tahun, bulan, 2)}-01`, sampai: hariIni },
    { id: "tahun", label: "Tahun ini", dari: `${tahun}-01-01`, sampai: hariIni },
  ];
}

export function Laporan({ data, kirim, sibuk }: { data: DashboardData; kirim: Kirim; sibuk: boolean }) {
  const presets = useMemo(() => susunPreset(data.hariIni), [data.hariIni]);
  const [preset, setPreset] = useState(presets[0]?.id ?? "bulan");
  const [dari, setDari] = useState(presets[0]?.dari ?? data.hariIni);
  const [sampai, setSampai] = useState(presets[0]?.sampai ?? data.hariIni);
  const [laporan, setLaporan] = useState<LaporanData | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [sheets, setSheets] = useState<StatusSheets>({
    mode: null,
    url: null,
    spreadsheetUrl: null,
    email: null,
    terakhir: null,
    googleSiap: false,
  });
  const [urlSheets, setUrlSheets] = useState("");
  const [memuatSheets, setMemuatSheets] = useState(true);
  const [galatSheets, setGalatSheets] = useState<string | null>(null);

  async function muatSheets() {
    setMemuatSheets(true);
    try {
      const res = await fetch("/api/sheets", { cache: "no-store", credentials: "same-origin" });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; data?: StatusSheets; error?: string };
      if (!res.ok || !j.ok || !j.data) throw new Error(j.error ?? "Gagal memuat integrasi.");
      setSheets(j.data);
      setUrlSheets(j.data.url ?? "");
      setGalatSheets(null);
    } catch (error) {
      setGalatSheets(error instanceof Error ? error.message : "Gagal memuat integrasi.");
    } finally {
      setMemuatSheets(false);
    }
  }

  useEffect(() => {
    void muatSheets();
  }, []);

  useEffect(() => {
    if (dari > sampai) {
      setMemuat(false);
      setGalat("Tanggal mulai harus sebelum tanggal akhir.");
      return;
    }
    let aktif = true;
    setMemuat(true);
    setGalat(null);
    fetch(`/api/laporan?dari=${encodeURIComponent(dari)}&sampai=${encodeURIComponent(sampai)}`, {
      cache: "no-store",
      credentials: "same-origin",
    })
      .then(async (res) => {
        if (res.status === 401) {
          window.location.href = "/login";
          return null;
        }
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; data?: LaporanData; error?: string };
        if (!res.ok || !j.ok || !j.data) throw new Error(j.error ?? "Gagal memuat laporan.");
        return j.data;
      })
      .then((hasil) => {
        if (aktif && hasil) setLaporan(hasil);
      })
      .catch((error) => {
        if (aktif) setGalat(error instanceof Error ? error.message : "Gagal memuat laporan.");
      })
      .finally(() => {
        if (aktif) setMemuat(false);
      });
    return () => {
      aktif = false;
    };
  }, [dari, sampai]);

  function pilihPreset(item: Preset) {
    setPreset(item.id);
    setDari(item.dari);
    setSampai(item.sampai);
  }

  async function simpanSheets() {
    if (await kirim("/api/sheets", "POST", { aksi: "simpan", url: urlSheets })) {
      await muatSheets();
    }
  }

  async function sinkronSheets() {
    if (await kirim("/api/sheets", "POST", { aksi: "sinkron" })) {
      await muatSheets();
    }
  }

  async function putusSheets() {
    if (await kirim("/api/sheets", "POST", { aksi: "putus" })) {
      await muatSheets();
    }
  }

  const aktifJadwal = data.pengaturan.laporanAktif;

  return (
    <div className="cn-halaman">
      <article className="saldo-kartu cn-span">
        <div className="saldo-teks">
          <p className="saldo-label">Arus bersih periode</p>
          <p className="saldo-angka">{laporan ? rp(laporan.ringkasan.bersih) : "—"}</p>
          <div className="cn-hero-mini">
            <span>Masuk <b>{laporan ? rp(laporan.ringkasan.masuk) : "—"}</b></span>
            <span>Keluar <b>{laporan ? rp(laporan.ringkasan.keluar) : "—"}</b></span>
            <span>Transaksi <b>{laporan ? laporan.ringkasan.jumlahTransaksi : "—"}</b></span>
          </div>
        </div>
        <span className="badge hijau">
          {memuat ? "Memuat..." : laporan ? `${laporan.jumlahHari} hari` : "—"}
        </span>
      </article>

      <section className="kartu cn-span">
        <div className="baris-antara">
          <div>
            <p className="eyebrow">LAPORAN</p>
            <h2>Laporan keuangan</h2>
          </div>
          <Tombol varian="sekunder" onClick={() => window.print()} disabled={memuat || !laporan}>
            Cetak / simpan PDF
          </Tombol>
        </div>
        <div className="laporan-preset" role="group" aria-label="Pilih periode">
          {presets.map((item) => (
            <button
              key={item.id}
              type="button"
              className={preset === item.id ? "chip aktif" : "chip"}
              onClick={() => pilihPreset(item)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="laporan-tanggal">
          <label>
            Dari
            <input
              type="date"
              value={dari}
              max={sampai}
              onChange={(event) => {
                setPreset("kustom");
                setDari(event.target.value);
              }}
            />
          </label>
          <label>
            Sampai
            <input
              type="date"
              value={sampai}
              min={dari}
              max={data.hariIni}
              onChange={(event) => {
                setPreset("kustom");
                setSampai(event.target.value);
              }}
            />
          </label>
          <span className="muted kecil">
            {laporan ? `${tanggalPendek(laporan.dari)} – ${tanggalPendek(laporan.sampai)}` : memuat ? "Memuat laporan..." : ""}
          </span>
        </div>
        {galat ? <p className="pesan-galat">{galat}</p> : null}
      </section>

      {laporan ? (
        <>
          <div className="stat-row cn-span">
            <article className="stat-kartu">
              <p className="stat-label">Pemasukan</p>
              <p className="angka masuk">{rp(laporan.ringkasan.masuk)}</p>
              <p className="muted kecil">Periode terpilih</p>
            </article>
            <article className="stat-kartu">
              <p className="stat-label">Pengeluaran</p>
              <p className="angka keluar">{rp(laporan.ringkasan.keluar)}</p>
              <p className="muted kecil">
                {laporan.ringkasan.biayaAdmin ? `Termasuk admin ${rp(laporan.ringkasan.biayaAdmin)}` : "Tanpa biaya admin"}
              </p>
            </article>
            <article className="stat-kartu">
              <p className="stat-label">Arus bersih</p>
              <p className={`angka ${laporan.ringkasan.bersih < 0 ? "keluar" : "masuk"}`}>{rp(laporan.ringkasan.bersih)}</p>
              <p className="muted kecil">Masuk − keluar</p>
            </article>
            <article className="stat-kartu">
              <p className="stat-label">Rata-rata harian</p>
              <p className="angka">{rp(laporan.ringkasan.rataHarian)}</p>
              <p className="muted kecil">Pengeluaran / hari</p>
            </article>
          </div>

          <section className="kartu">
            <div className="baris-antara">
              <h2>Pengeluaran per pos</h2>
              <span className="badge">{laporan.kategori.length} pos</span>
            </div>
            {laporan.kategori.length ? (
              <table className="laporan-tabel">
                <thead>
                  <tr>
                    <th>Pos</th>
                    <th className="kanan">Transaksi</th>
                    <th className="kanan">Total</th>
                    <th>Porsi</th>
                  </tr>
                </thead>
                <tbody>
                  {laporan.kategori.map((item) => (
                    <tr key={item.nama}>
                      <td>{item.nama}</td>
                      <td className="kanan">{item.jumlah}</td>
                      <td className="kanan">{rp(item.total)}</td>
                      <td>
                        <span className="laporan-porsi">
                          <i style={{ width: `${Math.max(2, item.porsi * 100)}%` }} />
                        </span>
                        <span className="muted kecil">{Math.round(item.porsi * 100)}%</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="muted kecil">Belum ada pengeluaran pada periode ini.</p>
            )}
          </section>

          <section className="kartu">
            <div className="baris-antara">
              <h2>Ringkasan per jenis</h2>
              <span className="badge">{laporan.tipe.length} jenis</span>
            </div>
            <table className="laporan-tabel">
              <thead>
                <tr>
                  <th>Jenis</th>
                  <th className="kanan">Jumlah</th>
                  <th className="kanan">Total</th>
                </tr>
              </thead>
              <tbody>
                {laporan.tipe.map((item) => (
                  <tr key={item.tipe}>
                    <td>{NAMA_TIPE[item.tipe] ?? item.tipe}</td>
                    <td className="kanan">{item.jumlah}</td>
                    <td className="kanan">{rp(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="kartu">
            <div className="baris-antara">
              <h2>Saldo dompet saat ini</h2>
              <span className="badge hijau">{rp(laporan.totalDompet)}</span>
            </div>
            <ul className="cn-legend">
              {laporan.dompet.map((item) => (
                <li key={item.id}>
                  <span className="avatar-uang">{(item.nama.trim().charAt(0) || "?").toUpperCase()}</span>
                  <span>{item.nama}</span>
                  <b>{rp(item.saldo)}</b>
                </li>
              ))}
              {!laporan.dompet.length ? <li className="muted kecil">Belum ada dompet.</li> : null}
            </ul>
          </section>

          <section className="kartu cn-span">
            <div className="baris-antara">
              <h2>Daftar transaksi</h2>
              <span className="badge">{laporan.transaksi.length} catatan</span>
            </div>
            {laporan.transaksi.length ? (
              <div className="laporan-tabel-gulir">
                <table className="laporan-tabel">
                  <thead>
                    <tr>
                      <th>Tanggal</th>
                      <th>Jenis</th>
                      <th>Pos / catatan</th>
                      <th>Dompet</th>
                      <th className="kanan">Nominal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {laporan.transaksi.map((tx) => (
                      <tr key={tx.id}>
                        <td>{tanggalPendek(tx.tanggal)}</td>
                        <td>{NAMA_TIPE[tx.tipe] ?? tx.tipe}</td>
                        <td>{tx.subPost ?? tx.label ?? "—"}</td>
                        <td>{tx.dompet ?? "—"}</td>
                        <td className="kanan">
                          {rp(tx.nominal)}
                          {tx.biayaAdmin ? <small className="muted"> + {rp(tx.biayaAdmin)}</small> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted kecil">Tidak ada transaksi pada periode ini.</p>
            )}
          </section>
        </>
      ) : null}

      <section className="kartu laporan-jadwal">
        <div className="baris-antara">
          <h2>Laporan terjadwal</h2>
          <span className={`badge ${aktifJadwal ? "hijau" : ""}`}>{aktifJadwal ? "Aktif" : "Mati"}</span>
        </div>
        <p className="muted kecil">
          Laporan periode terakhir dikirim ke WhatsApp pemilik dan email akun saat cron berjalan.
        </p>
        <div className="laporan-jadwal-aksi">
          <label>
            Frekuensi
            <select
              value={data.pengaturan.laporanJadwal}
              disabled={sibuk}
              onChange={(event) => void kirim("/api/pengaturan", "POST", { laporanJadwal: event.target.value })}
            >
              <option value="bulanan">Bulanan</option>
              <option value="mingguan">Mingguan</option>
            </select>
          </label>
          <Tombol
            varian="sekunder"
            disabled={sibuk}
            onClick={() => void kirim("/api/pengaturan", "POST", { laporanAktif: !aktifJadwal })}
          >
            {aktifJadwal ? "Matikan laporan terjadwal" : "Aktifkan laporan terjadwal"}
          </Tombol>
        </div>
      </section>

      <section className="kartu laporan-jadwal">
        <div className="baris-antara">
          <h2>Google Sheets</h2>
          <span className={`badge ${sheets.mode ? "hijau" : ""}`}>
            {memuatSheets
              ? "Memuat..."
              : sheets.mode === "google"
                ? "Google"
                : sheets.mode === "webhook"
                  ? "Webhook"
                  : "Belum"}
          </span>
        </div>
        <p className="muted kecil">
          {sheets.mode === "google"
            ? `Tersambung ke ${sheets.email ?? "akun Google"}. Spreadsheet diperbarui otomatis sekali sehari saat cron.`
            : "Hubungkan akun Google untuk membuat spreadsheet privat dan menyalin seluruh transaksi otomatis. Tidak perlu Apps Script."}
        </p>

        {sheets.mode === "google" ? (
          <div className="laporan-jadwal-aksi">
            {sheets.spreadsheetUrl ? (
              <TautanTombol varian="sekunder" href={sheets.spreadsheetUrl} target="_blank" rel="noreferrer">
                Buka spreadsheet
              </TautanTombol>
            ) : null}
            <Tombol disabled={sibuk || memuatSheets} onClick={() => void sinkronSheets()}>
              Sinkron sekarang
            </Tombol>
            <Tombol varian="bahaya" disabled={sibuk || memuatSheets} onClick={() => void putusSheets()}>
              Putuskan
            </Tombol>
          </div>
        ) : (
          <>
            <div className="laporan-jadwal-aksi">
              {sheets.googleSiap ? (
                <TautanTombol href="/api/sheets/oauth/start">Hubungkan Google Sheets</TautanTombol>
              ) : (
                <span className="muted kecil">Google OAuth belum dikonfigurasi di server.</span>
              )}
              {sheets.mode === "webhook" ? (
                <>
                  <Tombol disabled={sibuk || memuatSheets} onClick={() => void sinkronSheets()}>
                    Sinkron sekarang
                  </Tombol>
                  <Tombol varian="bahaya" disabled={sibuk || memuatSheets} onClick={() => void putusSheets()}>
                    Putuskan
                  </Tombol>
                </>
              ) : null}
            </div>
            <details>
              <summary className="muted kecil">Cadangan: web app Apps Script</summary>
              <p className="muted kecil">
                Tempel URL web app Apps Script bila tidak ingin memberi akses Google Drive.
              </p>
              <div className="form">
                <label>
                  URL web app Apps Script
                  <input
                    type="url"
                    value={urlSheets}
                    placeholder="https://script.google.com/macros/s/.../exec"
                    onChange={(event) => setUrlSheets(event.target.value)}
                  />
                </label>
              </div>
              <div className="laporan-jadwal-aksi">
                <Tombol varian="sekunder" disabled={sibuk || memuatSheets} onClick={() => void simpanSheets()}>
                  Simpan URL
                </Tombol>
              </div>
            </details>
          </>
        )}

        {galatSheets ? <p className="pesan-galat">{galatSheets}</p> : null}
        <p className="muted kecil">
          {sheets.terakhir
            ? `Sinkron terakhir ${new Date(sheets.terakhir).toLocaleString("id-ID")}`
            : "Belum pernah sinkron."}
        </p>
      </section>
    </div>
  );
}
