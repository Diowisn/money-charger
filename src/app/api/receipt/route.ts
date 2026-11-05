import type { NextRequest } from "next/server";
import { tolakJikaBelumLogin } from "@/lib/auth";
import { buatGroqVisionClient, validasiStruk } from "@/lib/ai-vision";
import { wibDate } from "@/lib/parse/date";
import { muatDashboard } from "@/modules/finance/model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAKS_BYTE = 8 * 1024 * 1024;
const MIME_DIIZINKAN = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(req: NextRequest) {
  const tolak = await tolakJikaBelumLogin(req);
  if (tolak) return tolak;
  const vision = buatGroqVisionClient();
  if (!vision) return Response.json({ ok: false, error: "Scan struk belum dikonfigurasi. Tambahkan GROQ_API_KEY." }, { status: 503 });

  try {
    const form = await req.formData();
    const file = form.get("image");
    if (!(file instanceof File)) return Response.json({ ok: false, error: "Pilih gambar struk." }, { status: 400 });
    if (!MIME_DIIZINKAN.has(file.type)) return Response.json({ ok: false, error: "Format gambar harus JPEG, PNG, atau WebP." }, { status: 400 });
    if (!file.size || file.size > MAKS_BYTE) return Response.json({ ok: false, error: "Ukuran gambar maksimal 8 MB." }, { status: 400 });

    const data = await muatDashboard();
    const raw = await vision.parseReceipt(Buffer.from(await file.arrayBuffer()).toString("base64"), file.type, data.posSemua.filter((pos) => pos.aktif).map((pos) => pos.nama));
    const hasil = validasiStruk(raw, data.posSemua.filter((pos) => pos.aktif).map((pos) => pos.nama), wibDate(Date.now()));
    if (!hasil.ok) return Response.json({ ok: false, error: "Struk tidak terbaca jelas. Coba foto ulang dengan nominal terlihat." }, { status: 422 });
    return Response.json({ ok: true, data: hasil.hasil });
  } catch {
    return Response.json({ ok: false, error: "Gagal memproses gambar struk." }, { status: 500 });
  }
}
