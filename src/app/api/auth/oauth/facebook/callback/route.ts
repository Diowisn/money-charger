import { NextRequest } from "next/server";
import { callback } from "@/modules/auth/oauth";

export async function GET(request: NextRequest) {
  return callback(request, "facebook");
}
