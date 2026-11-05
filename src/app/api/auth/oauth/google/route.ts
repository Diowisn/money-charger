import { NextRequest } from "next/server";
import { start } from "@/modules/auth/oauth";

export async function GET(request: NextRequest) {
  return start(request, "google");
}
