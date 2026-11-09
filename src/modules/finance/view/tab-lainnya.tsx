import { IkonPanah } from "./ikon";
import { MENU_LAINNYA } from "./menu";
import type { Tab } from "./tipe";

export function Lainnya({ navigasi }: { navigasi: (tab: Tab) => void }) {
  return (
    <div className="profil">
      <section>
        <h2 className="profil-subjudul">Menu lainnya</h2>
        <div className="profil-daftar">
          {MENU_LAINNYA.map(([id, label, Ikon]) => (
            <button key={id} type="button" onClick={() => navigasi(id)}>
              <Ikon aktif={false} />
              <span>{label}</span>
              <IkonPanah />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
