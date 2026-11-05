export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export { retryOutbox as POST } from "@/modules/outbox/controller";
