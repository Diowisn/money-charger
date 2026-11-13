import { useEffect, useState } from "react";
import { Tombol } from "@/components/tombol";
import type { DashboardData } from "@/lib/dashboard";
import { rp } from "./format";
import { InputRupiah } from "./input-rupiah";
import type { Kirim, MintaKonfirmasi } from "./tipe";

export function Pos({
  data,
  kirim,
  sibuk,
  mintaKonfirmasi,
}: {
  data: DashboardData;
  kirim: Kirim;
  sibuk: boolean;
  mintaKonfirmasi: MintaKonfirmasi;
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
  const totalJatah = posAktif.reduce((s, p) => s + p.jatahRencana, 0);
  const totalTerpakai = posAktif.reduce((s, p) => s + p.terpakai, 0);
  const totalSisa = Math.max(0, totalJatah - totalTerpakai);

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
    if (!(await mintaKonfirmasi("Nonaktifkan pos?", `Pos ${p.nama} akan dinonaktifkan.`))) return;
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
    <div className="cn-halaman">
      <article className="saldo-kartu cn-span">
        <div className="saldo-teks">
          <p className="saldo-label">Jatah pos aktif</p>
          <p className="saldo-angka">{rp(totalJatah)}</p>
          <div className="cn-hero-mini">
            <span>Terpakai <b>{rp(totalTerpakai)}</b></span>
            <span>Sisa <b>{rp(totalSisa)}</b></span>
            <span>Aktif <b>{posAktif.length} pos</b></span>
          </div>
        </div>
      </article>

      <div className="stat-row cn-span">
        <article className="stat-kartu">
          <p className="stat-label">Jatah rencana</p>
          <p className="angka">{rp(totalJatah)}</p>
          <p className="muted kecil">Total pos aktif</p>
        </article>
        <article className="stat-kartu">
          <p className="stat-label">Terpakai</p>
          <p className="angka">{rp(totalTerpakai)}</p>
          <p className="muted kecil">Periode berjalan</p>
        </article>
        <article className="stat-kartu">
          <p className="stat-label">Sisa jatah</p>
          <p className="angka">{rp(totalSisa)}</p>
          <p className="muted kecil">Belum terpakai</p>
        </article>
      </div>

      <section className="kartu">
        <div className="baris-antara">
          <h2>Tambah pos</h2>
          <span className="badge hijau">Baru</span>
        </div>
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
            <InputRupiah value={jatah} onChange={setJatah} placeholder="0" />
          </label>
          <Tombol lebar onClick={() => void tambah()} disabled={sibuk || !nama}>
            Tambah pos
          </Tombol>
          <p className="muted kecil">Pos baru langsung masuk rencana aktif dan berlaku mulai periode berikutnya.</p>
        </div>
      </section>

      <section className="kartu">
        <div className="baris-antara">
          <h2>Kelola pos</h2>
          <span className="badge">Edit</span>
        </div>
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
            <Tombol varian="sekunder" onClick={() => void gantiNama()} disabled={sibuk || !pilih}>
              Ganti nama
            </Tombol>
          </div>
          <div className="baris-tombol">
            <input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="Alias baru" />
            <Tombol varian="sekunder" onClick={() => void tambahAlias()} disabled={sibuk || !pilih}>
              Tambah alias
            </Tombol>
          </div>
          <Tombol varian="bahaya" lebar onClick={() => void nonaktifkan()} disabled={sibuk || !pilih}>
            Nonaktifkan pos
          </Tombol>
        </div>
      </section>

      <section className="kartu cn-span">
        <div className="baris-antara">
          <h2>Daftar pos</h2>
          <span className="badge">{data.grup.length} grup</span>
        </div>
        <div className="cn-grup-pos">
          {data.grup.map((g) => (
            <div key={g.id} className="cn-grup-kartu">
              <p className="label">{g.nama}</p>
              <ul>
                {g.pos.map((p) => {
                  const persen = p.jatahRencana > 0 ? Math.min(100, Math.round((p.terpakai / p.jatahRencana) * 100)) : 0;
                  return (
                    <li key={p.id}>
                      <div className="baris-antara">
                        <span>{p.nama}</span>
                        <span className="muted kecil">{rp(p.terpakai)} / {rp(p.jatahRencana)}</span>
                      </div>
                      <div className={`bar tipis ${persen >= 100 ? "lebih" : ""}`}>
                        <span style={{ width: `${persen}%` }} />
                      </div>
                    </li>
                  );
                })}
                {!g.pos.length ? <li className="muted">Belum ada pos aktif.</li> : null}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {data.bolehSetup ? (
        <section className="kartu cn-span">
          <div className="baris-antara">
            <h2>Setup awal</h2>
            <span className="badge hijau">Terbuka</span>
          </div>
          <p className="muted">
            Hanya bisa diubah sebelum gaji pertama. Setelah gaji masuk, pengaturan ini dikunci.
          </p>
          <div className="form form-baris">
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
              <InputRupiah
                value={setup.saldoAwal}
                onChange={(saldoAwal) => setSetup({ ...setup, saldoAwal })}
              />
            </label>
            <label>
              Tabungan awal (Rp)
              <InputRupiah
                value={setup.tabunganAwal}
                onChange={(tabunganAwal) => setSetup({ ...setup, tabunganAwal })}
              />
            </label>
            <label>
              Investasi awal (Rp)
              <InputRupiah
                value={setup.investasiAwal}
                onChange={(investasiAwal) => setSetup({ ...setup, investasiAwal })}
              />
            </label>
            <Tombol onClick={() => void simpanSetup()} disabled={sibuk}>
              Simpan setup
            </Tombol>
          </div>
        </section>
      ) : (
        <section className="kartu cn-span">
          <div className="baris-antara">
            <h2>Pengaturan terkunci</h2>
            <span className="badge">Terkunci</span>
          </div>
          <p className="muted">
            Gaji pertama sudah tercatat. Setup awal tidak bisa diubah lagi dari web.
          </p>
          <div className="stat-row">
            <article className="stat-kartu">
              <p className="stat-label">Tanggal mulai</p>
              <p className="angka kecil">{data.pengaturan.tanggalMulai ?? "-"}</p>
            </article>
            <article className="stat-kartu">
              <p className="stat-label">Saldo awal</p>
              <p className="angka">{rp(data.pengaturan.saldoAwal)}</p>
            </article>
            <article className="stat-kartu">
              <p className="stat-label">Tabungan awal</p>
              <p className="angka">{rp(data.pengaturan.tabunganAwal)}</p>
            </article>
            <article className="stat-kartu">
              <p className="stat-label">Investasi awal</p>
              <p className="angka">{rp(data.pengaturan.investasiAwal)}</p>
            </article>
          </div>
        </section>
      )}
    </div>
  );
}
