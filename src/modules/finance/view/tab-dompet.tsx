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
    if (!dompet.daftar.some((a) => String(a.id) === dariId)) setDariId(String(dompet.daftar[0]?.id ?? ""));
    if (!dompet.daftar.some((a) => String(a.id) === keId)) {
      setKeId(String(dompet.daftar.find((a) => String(a.id) !== dariId)?.id ?? ""));
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
    <div className="wawasan">
      <section className="kartu wawasan-skor">
        <div>
          <span className="badge hijau">Dompet</span>
          <h2>Kekayaan bersih</h2>
          <p className="wawasan-predikat">{rp(dompet.netWorth)}</p>
          <p className="muted kecil">Total saldo dompet + tabungan + investasi - utang aktif.</p>
        </div>
      </section>

      <section className="wawasan-grid">
        <div className="kartu wawasan-metrik">
          <p className="muted kecil">Saldo dompet</p>
          <p className="angka">{rp(dompet.total)}</p>
        </div>
        <div className="kartu wawasan-metrik">
          <p className="muted kecil">Tabungan + investasi</p>
          <p className="angka">{rp(dompet.tabungan + dompet.investasi)}</p>
        </div>
        <div className="kartu wawasan-metrik">
          <p className="muted kecil">Utang aktif</p>
          <p className="angka">{rp(dompet.utang)}</p>
        </div>
      </section>

      <section className="kartu">
        <h2>Saldo per dompet</h2>
        <ul className="wawasan-daftar">
          {dompet.daftar.map((akun) => (
            <li key={akun.id} className="baris-antara">
              <span>
                <b>{akun.nama}</b>
                <small className="muted"> · {LABEL_TIPE[akun.tipe] ?? akun.tipe}</small>
              </span>
              <b>{rp(akun.saldo)}</b>
            </li>
          ))}
          {!dompet.daftar.length ? <li className="muted kecil">Belum ada dompet.</li> : null}
        </ul>
      </section>

      <section className="kartu">
        <h2>Tambah dompet</h2>
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

      <section className="kartu">
        <h2>Pindah antar dompet</h2>
        <div className="form">
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
          <Tombol lebar onClick={() => void pindah()} disabled={sibuk || !nominal || dariId === keId || dompet.daftar.length < 2}>
            Pindahkan
          </Tombol>
        </div>
      </section>
    </div>
  );
}
