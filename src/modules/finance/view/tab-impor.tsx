import { useState } from "react";
import { Tombol } from "@/components/tombol";
import type { Kirim } from "./tipe";

const CONTOH = "tanggal,tipe,nominal,label,pos\n2026-01-05,out,25000,Kopi,Jajan / Kopi / Self-Reward\n2026-01-06,in,150000,Freelance,";

export function Impor({ kirim, sibuk }: { kirim: Kirim; sibuk: boolean }) {
  const [csv, setCsv] = useState("");
  const [namaFile, setNamaFile] = useState("");

  async function pilihFile(file: File | undefined) {
    if (!file) return;
    setNamaFile(file.name);
    setCsv(await file.text());
  }

  async function impor() {
    if (await kirim("/api/import", "POST", { csv })) {
      setCsv("");
      setNamaFile("");
    }
  }

  return (
    <div className="tumpuk dua-kolom">
      <section className="kartu">
        <span className="badge hijau">Impor</span>
        <h2>Impor Mutasi CSV</h2>
        <p className="muted kecil">
          Format wajib: <code>tanggal,tipe,nominal</code>. Opsional: <code>label,pos,biaya_admin,wadah</code>.
          Tipe menerima out/in, keluar/masuk, debit/kredit. Duplikat dengan isi sama dilewati.
        </p>
        <div className="form">
          <label>
            File CSV
            <input type="file" accept=".csv,text/csv" onChange={(e) => void pilihFile(e.target.files?.[0])} />
          </label>
          <label>
            Atau tempel CSV
            <textarea rows={10} value={csv} onChange={(e) => { setCsv(e.target.value); setNamaFile(""); }} placeholder={CONTOH} />
          </label>
        </div>
        <Tombol lebar onClick={() => void impor()} disabled={sibuk || !csv.trim()}>
          Impor sekarang
        </Tombol>
        {namaFile ? <p className="muted kecil">File: {namaFile}</p> : null}
      </section>

      <section className="kartu">
        <h2>Contoh & Aturan</h2>
        <pre className="kode-contoh">{CONTOH}</pre>
        <ul className="wawasan-daftar">
          <li>Tanggal: <code>YYYY-MM-DD</code> atau <code>DD/MM/YYYY</code>.</li>
          <li>Nominal: angka rupiah; titik/koma ribuan diterima.</li>
          <li>Pos dicocokkan dengan nama/alias pos yang sudah ada. Kosongkan bila belum tahu.</li>
          <li>Maksimal 1000 baris per impor. Transaksi tanggal masa depan ditolak.</li>
          <li>Impor yang sama tidak menggandakan transaksi.</li>
        </ul>
      </section>
    </div>
  );
}
