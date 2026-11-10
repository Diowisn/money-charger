import { validasiStruk } from "@/lib/ai-vision";
import { hitungWadah } from "@/lib/engine";
import { tglPendek } from "@/lib/format";
import { parseCommand, type Cmd } from "@/lib/parse/command";
import { wibDate } from "@/lib/parse/date";
import { TEKS_BANTUAN, teksLaporan, teksLaporanPeriode, teksWadah } from "@/lib/report";
import type { Repo } from "@/lib/repo";
import type { State } from "@/lib/types";
import { maskNomor } from "@/lib/whatsapp";
import { aturAi, bebas, ekspor, tanya } from "./ai";
import { debtBayar, debtDaftar, debtTambah } from "./debt";
import { goalDaftar, goalNabung, goalTambah } from "./goal";
import {
  TEKS_FOTO_GAGAL,
  TEKS_FOTO_TIDAK_JELAS,
  TEKS_NON_TEKS,
} from "./konstanta";
import { konfirmasi, hapusTerakhir, koreksi } from "./koreksi";
import { evaluasiManual, geser, kelolaPos, setRencana, usulan } from "./rencana";
import { bonus, catatIn, catatOut, gaji, setup } from "./transaksi";
import type { Deps, Masuk, SesiApi } from "./types";
import { aman, pindah, sisa } from "./wadah";

class Sesi implements SesiApi {
  state!: State;
  readonly today: string;
  readonly nowMs: number;
  readonly catatan: string[] = [];

  constructor(readonly r: Repo, readonly deps: Deps, readonly msg: Masuk) {
    this.today = wibDate(msg.timestampMs);
    this.nowMs = deps.now?.() ?? Date.now();
  }

  async muat() {
    this.state = await this.r.load();
  }

  async jalankan(): Promise<string> {
    await this.muat();
    const teks = this.msg.text ?? "";
    const cmd = parseCommand(teks, this.today);

    // FR-03: tanpa setup, pakai tanggal pesan pertama dan nilai Rp0
    if (!this.state.config.tanggalMulai && cmd.k !== "setup" && cmd.k !== "bantuan" && cmd.k !== "error") {
      await this.r.setConfig("tanggal_mulai", this.today);
      await this.muat();
      this.catatan.push(
        `Setup otomatis: mulai ${tglPendek(this.today)}, Saldo, Tabungan, dan Investasi awal Rp0. Ubah dengan "setup 17/10 saldo 300rb tabungan 0 investasi 0" selama gaji pertama belum dicatat.`,
      );
    }
    const balasan = await this.eksekusi(cmd, teks);
    return [balasan, ...this.catatan].join("\n\n");
  }

  /** Jalur foto struk/transaksi (Groq vision). Mirip bebas(), tetapi sumbernya gambar. */
  async jalankanFoto(): Promise<string> {
    await this.muat();
    if (!this.state.config.tanggalMulai) {
      await this.r.setConfig("tanggal_mulai", this.today);
      await this.muat();
      this.catatan.push(
        `Setup otomatis: mulai ${tglPendek(this.today)}, Saldo, Tabungan, dan Investasi awal Rp0. Ubah dengan "setup 17/10 saldo 300rb tabungan 0 investasi 0" selama gaji pertama belum dicatat.`,
      );
    }
    const balasan = await this.bacaFotoStruk();
    return [balasan, ...this.catatan].join("\n\n");
  }

  private async bacaFotoStruk(): Promise<string> {
    if (!this.deps.vision || !this.deps.unduhMedia || !this.msg.mediaId) return TEKS_NON_TEKS;
    const media = await this.deps.unduhMedia(this.msg.mediaId);
    if (!media) return TEKS_FOTO_GAGAL;

    const nama = this.state.subPosts.filter((s) => s.aktif).map((s) => s.nama);
    const raw = await this.deps.vision.parseReceipt(media.base64, media.mimeType, nama, this.msg.caption);
    const v = validasiStruk(raw, nama, this.today);
    if (!v.ok) return v.alasan === "tidak_jelas" ? TEKS_FOTO_TIDAK_JELAS : TEKS_FOTO_GAGAL;

    const h = v.hasil;
    const tanggal = h.tanggal ?? this.today;
    const subId = h.subPos ? this.state.subPosts.find((s) => s.nama === h.subPos)?.id ?? null : null;
    return catatOut(this, { nominal: h.nominal, uraian: h.label ?? "", tanggal, sumber: "ai", subPostId: subId });
  }

  private async eksekusi(cmd: Cmd, teks: string): Promise<string> {
    switch (cmd.k) {
      case "bantuan": return TEKS_BANTUAN;
      case "error": return cmd.pesan;
      case "setup": return setup(this, cmd);
      case "out":
        return catatOut(this, {
          nominal: cmd.nominal,
          biayaAdmin: cmd.biayaAdmin,
          uraian: cmd.uraian,
          tanggal: cmd.tanggal ?? this.today,
          sumber: "kaku",
        });
      case "in":
        return catatIn(this, cmd.nominal, cmd.label, cmd.wadah, cmd.tanggal ?? this.today, "kaku");
      case "gaji": return gaji(this, cmd.nominal, cmd.tanggal ?? this.today, false);
      case "bonus": return bonus(this, cmd.nominal, cmd.wadah, "kaku");
      case "koreksi": return koreksi(this, cmd);
      case "hapus_terakhir": return hapusTerakhir(this);
      case "ya": case "batal": return konfirmasi(this, cmd.k);
      case "setuju": case "tolak": return usulan(this, cmd.k);
      case "set": return setRencana(this, cmd.pos, cmd.nominal, cmd.sekarang);
      case "geser": return geser(this, cmd.nominal, cmd.dari, cmd.ke);
      case "pos": return kelolaPos(this, cmd);
      case "tarik": return pindah(this, cmd.nominal, cmd.wadah, "saldo", "tarik");
      case "pindah": return pindah(this, cmd.nominal, cmd.dari, cmd.ke, "pindah");
      case "saldo": return teksWadah(hitungWadah(this.state));
      case "aman": return aman(this);
      case "sisa": return sisa(this, cmd.pos);
      case "debt_add": return debtTambah(this, cmd.jenis, cmd.nominal, cmd.nama, cmd.jatuhTempo);
      case "debt_list": return debtDaftar(this, cmd.jenis);
      case "debt_pay": return debtBayar(this, cmd.jenis, cmd.nama, cmd.nominal);
      case "goal_add": return goalTambah(this, cmd.nominal, cmd.nama, cmd.targetTanggal);
      case "goal_list": return goalDaftar(this);
      case "goal_save": return goalNabung(this, cmd.nama, cmd.nominal);
      case "laporan": return teksLaporan(this.state, this.today);
      case "laporan_periode": return teksLaporanPeriode(this.state);
      case "evaluasi": return evaluasiManual(this);
      case "ekspor": return ekspor(this);
      case "ai": return aturAi(this, cmd.aksi);
      case "tanya": return tanya(this, cmd.teks);
      case "bebas": return bebas(this, teks);
    }
  }
}

/** Titik masuk. null = nomor asing atau pesan duplikat. */
export async function tanganiPesan(
  repo: Repo,
  deps: Deps,
  msg: Masuk,
): Promise<{ balasan: string; outboxId: number } | null> {
  if (!(await repo.isAllowed(msg.from))) {
    deps.log?.(`Pesan dari nomor di luar whitelist diabaikan: ${maskNomor(msg.from)}`);
    return null; // FR-01: diabaikan tanpa balasan
  }
  return repo.transaction(async (r) => {
    if (!(await r.tryRecordInbound(msg.id))) return null; // FR-80
    const sesi = new Sesi(r, deps, msg);
    let balasan: string;
    if (msg.type === "text") balasan = await sesi.jalankan();
    else if (msg.type === "image" && msg.mediaId) balasan = await sesi.jalankanFoto();
    else balasan = TEKS_NON_TEKS;
    const outboxId = await r.addOutbox(msg.from, balasan);
    await r.setInboundResult(msg.id, balasan.slice(0, 120));
    return { balasan, outboxId };
  });
}
