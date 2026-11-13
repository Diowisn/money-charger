import { useEffect, useState } from "react";
import { Tombol } from "@/components/tombol";
import type { DashboardData } from "@/lib/dashboard";
import { rp } from "./format";
import type { Kirim } from "./tipe";

const LABEL_TIPE: Record<string, string> = {
  bank: "Rekening bank",
  ewallet: "E-wallet",
  tunai: "Tunai",
  lainnya: "Lainnya",
};

export function Dompet({ data, kirim, sibuk }: { data: DashboardData; kirim: Kirim; sibuk: boolean }) {
  const dompet = data.dompet;
  const [nama, setNama] = useState("");
  const [tipe, setTipe] = useState("tunai");
  const [saldoAwal, setSaldoAwal] = useState("");
  const [dariId, setDariId] = useState("");
  const [keId, setKeId] = useState("");
  const [nominal, setNominal] = useState("");
  const [label, setLabel] = useState("");

  useEffect(() => {
    const ids = dompet.daftar.map((a) => String(a.id));
    const dari = ids.includes(dariId) ? dariId : (ids[0] ?? "");
    if (dari !== dariId) setDariId(dari);
    if (!ids.includes(keId) || keId === dari) {
      setKeId(ids.find((id) => id !== dari) ?? "");
    }
  }, [dompet.daftar, dariId, keId]);

  async function tambah() {
    if (!nama.trim()) return;
    const ok = await kirim("/api/accounts", "POST", {
      aksi: "tambah",
      nama: nama.trim(),
      tipe,
      saldoAwal: Number(saldoAwal || 0),
    });
    if (ok) {
      setNama("");
      setSaldoAwal("");
    }
  }

  async function pindah() {
    const ok = await kirim("/api/accounts", "POST", {
      aksi: "pindah",
      dariId: Number(dariId),
      keId: Number(keId),
      nominal: Number(nominal),
      tanggal: data.hariIni,
      label: label || null,
    });
    if (ok) {
      setNominal("");
      setLabel("");
    }
  }

  return (
    <div className="cn-halaman">
      <article className="saldo-kartu cn-span">
        <div className="saldo-teks">
          <p className="saldo-label">Kekayaan bersih</p>
          <p className="saldo-angka">{rp(dompet.netWorth)}</p>
          <p className="saldo-sub">Saldo dompet + tabungan + investasi − utang aktif.</p>
        </div>
      </article>

      <div className="stat-row cn-span">
        <article className="stat-kartu">
          <p className="stat-label">Saldo dompet</p>
          <p className="angka">{rp(dompet.total)}</p>
          <p className="muted kecil">{dompet.daftar.length} dompet aktif</p>
        </article>
        <article className="stat-kartu">
          <p className="stat-label">Tabungan + investasi</p>
          <p className="angka">{rp(dompet.tabungan + dompet.investasi)}</p>
          <p className="muted kecil">Aset tersimpan</p>
        </article>
        <article className="stat-kartu">
          <p className="stat-label">Utang aktif</p>
          <p className="angka">{rp(dompet.utang)}</p>
          <p className="muted kecil">Total kewajiban</p>
        </article>
      </div>

      <section className="kartu">
        <div className="baris-antara">
          <h2>Saldo per dompet</h2>
          <span className="badge">{dompet.daftar.length} dompet</span>
        </div>
        <ul className="cn-akun">
          {dompet.daftar.map((akun) => (
            <li key={akun.id}>
              <span className="avatar-uang">{(akun.nama.trim().charAt(0) || "?").toUpperCase()}</span>
              <div>
                <b>{akun.nama}</b>
                <p className="muted kecil">{LABEL_TIPE[akun.tipe] ?? akun.tipe}</p>
              </div>
              <b className="ringkas-jumlah masuk">{rp(akun.saldo)}</b>
            </li>
          ))}
          {!dompet.daftar.length ? <li className="muted kecil">Belum ada dompet.</li> : null}
        </ul>
      </section>

      <section className="kartu">
        <div className="baris-antara">
          <h2>Tambah dompet</h2>
          <span className="badge hijau">Baru</span>
        </div>
        <div className="form">
          <label>
            Nama dompet
            <input value={nama} onChange={(e) => setNama(e.target.value)} placeholder="contoh BCA / GoPay" maxLength={80} />
          </label>
          <label>
            Tipe
            <select value={tipe} onChange={(e) => setTipe(e.target.value)}>
              {Object.entries(LABEL_TIPE).map(([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
            </select>
          </label>
          <label>
            Saldo awal (Rp)
            <input type="number" min={0} step={1000} inputMode="numeric" value={saldoAwal} onChange={(e) => setSaldoAwal(e.target.value)} placeholder="0" />
          </label>
          <Tombol lebar onClick={() => void tambah()} disabled={sibuk || !nama.trim()}>
            Tambah dompet
          </Tombol>
        </div>
      </section>

      <section className="kartu cn-span">
        <div className="baris-antara">
          <h2>Pindah antar dompet</h2>
          <span className="badge">Transfer</span>
        </div>
        <div className="form form-baris">
          <label>
            Dari
            <select value={dariId} onChange={(e) => setDariId(e.target.value)}>
              {dompet.daftar.map((akun) => (
                <option key={akun.id} value={akun.id}>
                  {akun.nama} ({rp(akun.saldo)})
                </option>
              ))}
            </select>
          </label>
          <label>
            Ke
            <select value={keId} onChange={(e) => setKeId(e.target.value)}>
              {dompet.daftar.map((akun) => (
                <option key={akun.id} value={akun.id}>
                  {akun.nama}
                </option>
              ))}
            </select>
          </label>
          <label>
            Nominal (Rp)
            <input type="number" min={1} step={1000} inputMode="numeric" value={nominal} onChange={(e) => setNominal(e.target.value)} placeholder="contoh 100000" />
          </label>
          <label>
            Catatan (opsional)
            <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} />
          </label>
          <Tombol onClick={() => void pindah()} disabled={sibuk || !nominal || dariId === keId || dompet.daftar.length < 2}>
            Pindahkan
          </Tombol>
        </div>
      </section>
    </div>
  );
}
