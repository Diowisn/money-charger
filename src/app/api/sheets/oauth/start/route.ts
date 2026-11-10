import type { NextRequest } from "next/server";
import { startSheets } from "@/modules/auth/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return startSheets(request);
}
