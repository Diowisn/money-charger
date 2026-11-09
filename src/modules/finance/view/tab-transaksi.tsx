import { useEffect, useMemo, useState } from "react";
import { Tombol } from "@/components/tombol";
import type { DashboardData, TxView } from "@/lib/dashboard";
import { unduhXlsx } from "@/lib/xlsx";
import { NAMA_TIPE, labelBulan, rp, tanggalPendek } from "./format";
import type { Kirim, MintaKonfirmasi, Tab } from "./tipe";

export function Transaksi({
  data,
  kirim,
  sibuk,
  mode,
  tipeAwal,
  navigasi,
  mintaKonfirmasi,
  bukaDetail,
}: {
  data: DashboardData;
  kirim: Kirim;
  sibuk: boolean;
  mode: "catat" | "riwayat";
  tipeAwal: "in" | "out";
  navigasi: (tab: Tab) => void;
  mintaKonfirmasi: MintaKonfirmasi;
  bukaDetail: (t: TxView) => void;
}) {
  const [tipe, setTipe] = useState<string>(tipeAwal);
  const [nominal, setNominal] = useState("");
  const [biayaAdminAktif, setBiayaAdminAktif] = useState(false);
  const [biayaAdmin, setBiayaAdmin] = useState("");
  const [tanggal, setTanggal] = useState(data.hariIni);
  const [label, setLabel] = useState("");
  const [accountId, setAccountId] = useState("");
  const [subPostId, setSubPostId] = useState("");
  const [wadah, setWadah] = useState("saldo");
  const [wadahAsal, setWadahAsal] = useState("tabungan");
  const [wadahTujuan, setWadahTujuan] = useState("saldo");
  const [paksa, setPaksa] = useState(false);
  const [bulanFilter, setBulanFilter] = useState("semua");
  const [cari, setCari] = useState("");
  const [halaman, setHalaman] = useState(1);

  useEffect(() => {
    if (mode === "catat") setTipe(tipeAwal);
  }, [mode, tipeAwal]);

  const posAktif = data.posSemua.filter((p) => p.aktif);
  const PER_HALAMAN = 10;

  const daftarBulan = useMemo(
    () =>
      [...new Set(data.transaksi.map((t) => t.tanggal.slice(0, 7)))].sort((a, b) => (a < b ? 1 : -1)),
    [data.transaksi],
  );

  const tersaring = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return data.transaksi.filter((t) => {
      if (bulanFilter !== "semua" && !t.tanggal.startsWith(bulanFilter)) return false;
      if (!q) return true;
      const isi = `${t.subPost ?? ""} ${t.label ?? ""} ${t.tanggal} ${t.wadahTujuan ?? ""} ${t.wadahAsal ?? ""}`;
      return isi.toLowerCase().includes(q);
    });
  }, [data.transaksi, bulanFilter, cari]);

  const totalHalaman = Math.max(1, Math.ceil(tersaring.length / PER_HALAMAN));
  const halamanAman = Math.min(halaman, totalHalaman);
  const tampil = tersaring.slice((halamanAman - 1) * PER_HALAMAN, halamanAman * PER_HALAMAN);

  async function simpan() {
    const body: Record<string, unknown> = { tipe, nominal: Number(nominal), tanggal, label: label || null };
    if (tipe === "out") {
      body.subPostId = subPostId ? Number(subPostId) : null;
      body.biayaAdmin = biayaAdminAktif ? Number(biayaAdmin || 0) : 0;
    }
    if (tipe === "out" || tipe === "in" || tipe === "gaji" || tipe === "bonus") {
      body.accountId = accountId ? Number(accountId) : null;
    }
    if ((tipe === "tarik" || tipe === "pindah") && wadahAsal === "saldo") {
      body.accountId = accountId ? Number(accountId) : null;
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
    if (!(await mintaKonfirmasi("Batalkan transaksi?", `Batalkan ${teks}?`))) return;
    await kirim("/api/transactions", "DELETE", { id });
  }

  return (
    <div className={mode === "catat" ? "tumpuk layar-catat" : "tumpuk layar-riwayat"}>
      {mode === "catat" ? (
      <section className="kartu form-transaksi">
        <div className="section-title">
          <div>
            <p className="eyebrow">TRANSAKSI BARU</p>
            <h2>Catat transaksi</h2>
          </div>
          <span className="badge">{data.hariIni}</span>
        </div>
        <div className="form form-transaksi-grid">
          <fieldset className="segmented">
            <legend>Jenis transaksi</legend>
            {([
              ["out", "Pengeluaran"],
              ["in", "Pemasukan"],
              ["gaji", "Gaji"],
              ["bonus", "Bonus"],
              ["tarik", "Tarik"],
              ["pindah", "Pindah"],
            ] as [string, string][]).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={tipe === value ? "segmented-item aktif" : "segmented-item"}
                aria-pressed={tipe === value}
                onClick={() => setTipe(value)}
              >
                {label}
              </button>
            ))}
          </fieldset>

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

          {tipe === "out" || tipe === "in" || tipe === "gaji" || tipe === "bonus" ? (
            <label>
              Dompet
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">Dompet utama</option>
                {data.dompet.daftar.map((akun) => (
                  <option key={akun.id} value={akun.id}>
                    {akun.nama} ({rp(akun.saldo)})
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {tipe === "out" ? (
            <>
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

          {(tipe === "tarik" || tipe === "pindah") && wadahAsal === "saldo" ? (
            <label>
              Dompet asal
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">Dompet utama</option>
                {data.dompet.daftar.map((akun) => (
                  <option key={akun.id} value={akun.id}>
                    {akun.nama} ({rp(akun.saldo)})
                  </option>
                ))}
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

          <Tombol lebar onClick={() => void simpan()} disabled={sibuk || !nominal}>
            {sibuk ? "Menyimpan..." : "Simpan transaksi"}
          </Tombol>
        </div>
      </section>
      ) : null}

      {mode === "riwayat" ? (
      <section className="kartu riwayat-panel">
        <div className="section-title">
          <div>
            <p className="eyebrow">TRANSAKSI</p>
            <h2>Semua transaksi</h2>
          </div>
          <span className="badge">{tersaring.length} catatan</span>
        </div>

        <div className="filter-riwayat">
          <Tombol varian="sekunder" onClick={() => void unduhXlsx(data.transaksi, NAMA_TIPE)}>
            Ekspor rekap (.xlsx)
          </Tombol>
          <span className="muted kecil">Satu sheet per bulan, plus ringkasan, kategori, dan transaksi dibatalkan.</span>
        </div>
        <div className="filter-riwayat">
          <label className="filter-jenis">
            Bulan
            <select
              value={bulanFilter}
              onChange={(e) => {
                setBulanFilter(e.target.value);
                setHalaman(1);
              }}
            >
              <option value="semua">Semua bulan</option>
              {daftarBulan.map((b) => (
                <option key={b} value={b}>
                  {labelBulan(b)}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-cari">
            Cari transaksi
            <input
              value={cari}
              onChange={(e) => {
                setCari(e.target.value);
                setHalaman(1);
              }}
              placeholder="Cari transaksi"
            />
          </label>
        </div>
        <ul className="daftar-transaksi daftar-rapi">
          {tampil.map((t) => {
            const keluar = t.tipe === "out";
            const judul = t.subPost ?? t.label ?? NAMA_TIPE[t.tipe] ?? "Tanpa pos";
            const nilai = keluar ? t.nominal + t.biayaAdmin : t.nominal;
            return (
              <li
                key={t.id}
                className={t.status === "batal" ? "item-transaksi batal" : "item-transaksi"}
                role="button"
                tabIndex={0}
                onClick={() => bukaDetail(t)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    bukaDetail(t);
                  }
                }}
              >
                <span className={keluar ? "avatar-uang" : "avatar-uang masuk"}>
                  {judul.trim().charAt(0).toUpperCase() || "?"}
                </span>
                <div className="ringkas-info">
                  <p className="ringkas-nama">{judul}</p>
                  <p className="muted kecil">
                    {tanggalPendek(t.tanggal)} · {NAMA_TIPE[t.tipe] ?? t.tipe}
                  </p>
                </div>
                <div className="transaksi-kanan">
                  <b className={keluar ? "ringkas-jumlah" : "ringkas-jumlah masuk"}>
                    {keluar ? "−" : "+"} {rp(nilai)}
                  </b>
                  {t.bisaDihapus ? (
                    <button
                      type="button"
                      className="hapus-kecil"
                      onClick={(event) => {
                        event.stopPropagation();
                        void hapus(t.id, `${NAMA_TIPE[t.tipe] ?? t.tipe} ${rp(t.nominal)}`);
                      }}
                      disabled={sibuk}
                    >
                      Hapus
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
          {!tersaring.length ? (
            <li className="kosong">{data.transaksi.length ? "Tidak ada catatan yang cocok." : "Belum ada transaksi."}</li>
          ) : null}
        </ul>
        <Tombol className="tombol-grafik" lebar onClick={() => navigasi("rekap")}>
          Lihat Grafik
        </Tombol>
        {totalHalaman > 1 ? (
          <nav className="paginasi" aria-label="Halaman transaksi">
            <button
              type="button"
              className="panah-halaman"
              onClick={() => setHalaman((h) => Math.max(1, h - 1))}
              disabled={halamanAman <= 1}
              aria-label="Halaman sebelumnya"
              title="Halaman sebelumnya"
            >
              ←
            </button>
            <span aria-live="polite">{halamanAman} / {totalHalaman}</span>
            <button
              type="button"
              className="panah-halaman"
              onClick={() => setHalaman((h) => Math.min(totalHalaman, h + 1))}
              disabled={halamanAman >= totalHalaman}
              aria-label="Halaman berikutnya"
              title="Halaman berikutnya"
            >
              →
            </button>
          </nav>
        ) : null}
      </section>
      ) : null}
    </div>
  );
}
