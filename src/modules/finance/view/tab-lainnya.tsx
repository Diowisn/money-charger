import { IkonPanah } from "./ikon";
import { MENU_LAINNYA } from "./menu";
import type { Tab } from "./tipe";

export function Lainnya({ navigasi }: { navigasi: (tab: Tab) => void }) {
  return (
    <div className="cn-halaman">
      <article className="saldo-kartu cn-span">
        <div className="saldo-teks">
          <p className="saldo-label">Menu lainnya</p>
          <p className="saldo-angka">Semua fitur</p>
          <p className="saldo-sub">Kelola pos, dompet, target, tagihan otomatis, laporan, dan asisten dari satu tempat.</p>
        </div>
      </article>

      <section className="kartu cn-span">
        <div className="baris-antara">
          <h2>Fitur</h2>
          <span className="badge">{MENU_LAINNYA.length} menu</span>
        </div>
        <div className="cn-menu-grid">
          {MENU_LAINNYA.map(([id, label, Ikon]) => (
            <button key={id} type="button" className="cn-menu-item" onClick={() => navigasi(id)}>
              <span className="stat-ikon">
                <Ikon aktif={false} />
              </span>
              <span className="cn-menu-teks">
                <b>{label}</b>
                <small className="muted kecil">Buka {label.toLowerCase()}</small>
              </span>
              <IkonPanah />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
