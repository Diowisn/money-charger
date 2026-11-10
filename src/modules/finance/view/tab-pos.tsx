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
    <div className="tumpuk dua-kolom">
      <div className="tumpuk kolom">
        <section className="kartu">
          <h2>Tambah Pos</h2>
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
        <h2>Kelola Pos</h2>
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
      </div>

      <section className="kartu">
        <h2>Daftar Pos</h2>
        <div className="tabel">
          {data.grup.map((g) => (
            <div key={g.id} className="blok-pos">
              <p className="label">{g.nama}</p>
              <ul>
                {g.pos.map((p) => (
                  <li key={p.id}>
                    <span>{p.nama}</span>
                    <span className="muted">
                      {rp(p.jatahRencana)} · terpakai {rp(p.terpakai)}
                    </span>
                  </li>
                ))}
                {!g.pos.length ? <li className="muted">Belum ada pos aktif.</li> : null}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {data.bolehSetup ? (
        <section className="kartu lebar">
          <h2>Setup Awal</h2>
          <p className="muted">
            Hanya bisa diubah sebelum gaji pertama. Setelah gaji masuk, pengaturan ini dikunci.
          </p>
          <div className="form">
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
            <Tombol lebar onClick={() => void simpanSetup()} disabled={sibuk}>
              Simpan setup
            </Tombol>
          </div>
        </section>
      ) : (
        <section className="kartu lebar">
          <h2>Pengaturan Terkunci</h2>
          <p className="muted">
            Gaji pertama sudah tercatat. Setup awal tidak bisa diubah lagi dari web.
          </p>
          <div className="grid-3">
            <div>
              <p className="label">Tanggal mulai</p>
              <p>{data.pengaturan.tanggalMulai ?? "-"}</p>
            </div>
            <div>
              <p className="label">Saldo awal</p>
              <p>{rp(data.pengaturan.saldoAwal)}</p>
            </div>
            <div>
              <p className="label">Tabungan awal</p>
              <p>{rp(data.pengaturan.tabunganAwal)}</p>
            </div>
            <div>
              <p className="label">Investasi awal</p>
              <p>{rp(data.pengaturan.investasiAwal)}</p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
