import { terimaWebhook, verifikasiWebhook } from "@/modules/whatsapp/controller";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Batas tertinggi yang diminta; batas sebenarnya mengikuti paket Vercel (dicek dulu, SRS A4/NFR-03).
export const maxDuration = 30;

export const GET = verifikasiWebhook;
export const POST = terimaWebhook;
