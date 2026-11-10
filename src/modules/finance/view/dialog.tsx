import { Tombol } from "@/components/tombol";
import type { DashboardData, TxView } from "@/lib/dashboard";
import { BarisInfo } from "./komponen";
import { KUNCI_UANG_DETAIL, LABEL_DETAIL, NAMA_TIPE, rp, rpOpsional, tanggalPendek } from "./format";
import { InputRupiah } from "./input-rupiah";
import type { HasilScan, Konfirmasi } from "./tipe";

export function ScanDialog({
  data,
  hasilScan,
  setHasilScan,
  editScan,
  setEditScan,
  sibuk,
  simpan,
}: {
  data: DashboardData;
  hasilScan: HasilScan;
  setHasilScan: (h: HasilScan) => void;
  editScan: boolean;
  setEditScan: (b: boolean) => void;
  sibuk: boolean;
  simpan: () => void;
}) {
  return (
    <div className="scan-overlay" role="presentation">
      <section className="scan-dialog scan-result" role="dialog" aria-modal="true" aria-labelledby="scan-title">
        <h2 id="scan-title" className="scan-result-title">Scan Result</h2>
        <div className="scan-preview">
          <p className="scan-preview-label"><span aria-hidden="true" /> Preview</p>
          {editScan ? (
            <div className="scan-form">
              <label>Toko
                <input type="text" maxLength={80} value={hasilScan.toko ?? ""} onChange={(event) => setHasilScan({ ...hasilScan, toko: event.target.value || null })} />
              </label>
              <label>Alamat
                <input type="text" maxLength={120} value={hasilScan.alamat ?? ""} onChange={(event) => setHasilScan({ ...hasilScan, alamat: event.target.value || null })} />
              </label>
              <label>Kontak
                <input type="text" maxLength={40} value={hasilScan.kontak ?? ""} onChange={(event) => setHasilScan({ ...hasilScan, kontak: event.target.value || null })} />
              </label>
              <label>Konsumen
                <input type="text" maxLength={80} value={hasilScan.konsumen ?? ""} onChange={(event) => setHasilScan({ ...hasilScan, konsumen: event.target.value || null })} />
              </label>
              <label>Tanggal
                <input type="date" value={hasilScan.tanggal ?? data.hariIni} onChange={(event) => setHasilScan({ ...hasilScan, tanggal: event.target.value || null })} />
              </label>
              <label>Kasir
                <input type="text" maxLength={60} value={hasilScan.kasir ?? ""} onChange={(event) => setHasilScan({ ...hasilScan, kasir: event.target.value || null })} />
              </label>
            </div>
          ) : (
            <dl className="daftar-info">
              <BarisInfo label="Toko" nilai={hasilScan.toko ?? hasilScan.label} />
              <BarisInfo label="Alamat" nilai={hasilScan.alamat} />
              <BarisInfo label="Kontak" nilai={hasilScan.kontak} />
              <BarisInfo label="Konsumen" nilai={hasilScan.konsumen} />
              <BarisInfo label="Tanggal" nilai={tanggalPendek(hasilScan.tanggal ?? data.hariIni)} />
              <BarisInfo label="Kasir" nilai={hasilScan.kasir} />
            </dl>
          )}
        </div>

        <div className="scan-divider" />

        {editScan ? (
          <div className="scan-form">
            <label>Total biaya
              <InputRupiah value={hasilScan.nominal} onChange={(nominal) => setHasilScan({ ...hasilScan, nominal: Number(nominal) })} />
            </label>
            <label>Pajak
              <InputRupiah value={hasilScan.pajak ?? ""} onChange={(pajak) => setHasilScan({ ...hasilScan, pajak: pajak === "" ? null : Number(pajak) })} />
            </label>
            <label>Dibayar
              <InputRupiah value={hasilScan.dibayar ?? ""} onChange={(dibayar) => setHasilScan({ ...hasilScan, dibayar: dibayar === "" ? null : Number(dibayar) })} />
            </label>
            <label>Kembalian
              <InputRupiah value={hasilScan.kembalian ?? ""} onChange={(kembalian) => setHasilScan({ ...hasilScan, kembalian: kembalian === "" ? null : Number(kembalian) })} />
            </label>
            <label>Kategori
              <select value={hasilScan.subPos ?? ""} onChange={(event) => setHasilScan({ ...hasilScan, subPos: event.target.value || null })}>
                <option value="">Belum dipetakan</option>
                {data.posSemua.filter((pos) => pos.aktif).map((pos) => <option key={pos.id} value={pos.nama}>{pos.nama}</option>)}
              </select>
            </label>
          </div>
        ) : (
          <dl className="daftar-info">
            <BarisInfo label="Total Biaya" nilai={<b>{rp(hasilScan.nominal)}</b>} />
            <BarisInfo label="Pajak" nilai={rpOpsional(hasilScan.pajak)} />
            <BarisInfo label="Dibayar" nilai={rpOpsional(hasilScan.dibayar)} />
            <BarisInfo label="Kembalian" nilai={rpOpsional(hasilScan.kembalian)} />
            <BarisInfo label="Kategori" nilai={hasilScan.subPos ?? hasilScan.kategori} />
          </dl>
        )}

        <div className="scan-actions">
          {editScan ? (
            <Tombol varian="sekunder" onClick={() => setEditScan(false)}>Batal</Tombol>
          ) : (
            <Tombol varian="sekunder" onClick={() => setEditScan(true)}>Edit</Tombol>
          )}
          <Tombol disabled={sibuk || hasilScan.nominal < 1} onClick={simpan}>
            Simpan
          </Tombol>
        </div>
      </section>
    </div>
  );
}

export function KonfirmasiDialog({
  konfirmasi,
  setKonfirmasi,
}: {
  konfirmasi: Konfirmasi;
  setKonfirmasi: (k: Konfirmasi | null) => void;
}) {
  return (
    <div className="dialog-overlay" onMouseDown={(event) => {
      if (event.target === event.currentTarget) {
        konfirmasi.selesai(false);
        setKonfirmasi(null);
      }
    }}>
      <section className="dialog-kartu" role="alertdialog" aria-modal="true" aria-labelledby="konfirmasi-judul">
        <h2 id="konfirmasi-judul">{konfirmasi.judul}</h2>
        <p>{konfirmasi.teks}</p>
        <div className="dialog-aksi">
          <Tombol varian="sekunder" onClick={() => { konfirmasi.selesai(false); setKonfirmasi(null); }}>
            Batal
          </Tombol>
          <Tombol varian="bahaya" onClick={() => { konfirmasi.selesai(true); setKonfirmasi(null); }}>
            Ya, lanjutkan
          </Tombol>
        </div>
      </section>
    </div>
  );
}

export function DetailDialog({ detailTx, tutup }: { detailTx: TxView; tutup: () => void }) {
  const detailEntries = Object.entries(detailTx.detail ?? {}).filter(([, nilai]) => nilai !== null && nilai !== "");
  return (
    <div
      className="dialog-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) tutup();
      }}
    >
      <section className="dialog-kartu detail-kartu" role="dialog" aria-modal="true" aria-labelledby="detail-judul">
        <div className="detail-kepala">
          <h2 id="detail-judul">{detailTx.subPost ?? detailTx.label ?? NAMA_TIPE[detailTx.tipe] ?? "Transaksi"}</h2>
          <span className="badge">{NAMA_TIPE[detailTx.tipe] ?? detailTx.tipe}</span>
        </div>
        <dl className="daftar-info">
          <BarisInfo label="Tanggal" nilai={tanggalPendek(detailTx.tanggal)} />
          <BarisInfo label="Nominal" nilai={rp(detailTx.nominal)} />
          {detailTx.biayaAdmin > 0 ? <BarisInfo label="Biaya admin" nilai={rp(detailTx.biayaAdmin)} /> : null}
          <BarisInfo
            label="Total"
            nilai={<b>{rp(detailTx.tipe === "out" ? detailTx.nominal + detailTx.biayaAdmin : detailTx.nominal)}</b>}
          />
          <BarisInfo label="Pos" nilai={detailTx.subPost} />
          <BarisInfo label="Catatan" nilai={detailTx.label} />
          {detailTx.wadahAsal ? <BarisInfo label="Wadah asal" nilai={detailTx.wadahAsal} /> : null}
          {detailTx.wadahTujuan ? <BarisInfo label="Wadah tujuan" nilai={detailTx.wadahTujuan} /> : null}
          <BarisInfo label="Status" nilai={detailTx.status === "batal" ? "Dibatalkan" : "Berlaku"} />
        </dl>
        {detailEntries.length ? (
          <>
            <p className="detail-subjudul">Detail sumber</p>
            <dl className="daftar-info">
              {detailEntries.map(([kunci, nilai]) => (
                <BarisInfo
                  key={kunci}
                  label={LABEL_DETAIL[kunci] ?? kunci}
                  nilai={KUNCI_UANG_DETAIL.has(kunci) && typeof nilai === "number" ? rp(nilai) : String(nilai)}
                />
              ))}
            </dl>
          </>
        ) : null}
        <div className="dialog-aksi">
          <Tombol varian="sekunder" onClick={tutup}>Tutup</Tombol>
        </div>
      </section>
    </div>
  );
}
