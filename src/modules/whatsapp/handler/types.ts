import type { Repo } from "@/lib/repo";
import type { State } from "@/lib/types";

export interface Deps {
  ai: import("@/lib/ai").AiClient | null;
  /** Pembaca foto struk/transaksi (Groq vision); null bila GROQ_API_KEY kosong. */
  vision?: import("@/lib/ai-vision").VisionClient | null;
  /** Mengunduh media WhatsApp (gambar) jadi base64 + mime type; null bila kredensial belum lengkap. */
  unduhMedia?: (mediaId: string) => Promise<{ base64: string; mimeType: string } | null>;
  /** jam sistem (epoch ms); dapat disuntik saat pengujian */
  now?: () => number;
  /** URL publik untuk tautan ekspor */
  baseUrl?: string;
  /** log operasional (tanpa isi pesan, nomor harus sudah dimaskir) */
  log?: (pesan: string) => void;
}

export interface Masuk {
  id: string;
  from: string;
  type: string;
  text?: string;
  /** ID media WhatsApp untuk pesan bertipe "image" */
  mediaId?: string;
  /** teks pendamping (caption) pada pesan gambar, bila ada */
  caption?: string;
  timestampMs: number;
}

export interface SesiApi {
  readonly r: Repo;
  readonly deps: Deps;
  readonly msg: Masuk;
  state: State;
  readonly today: string;
  readonly nowMs: number;
  readonly catatan: string[];
  muat(): Promise<void>;
}
