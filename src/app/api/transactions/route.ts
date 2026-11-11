export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export {
  postTransaction as POST,
  patchTransaction as PATCH,
  deleteTransaction as DELETE,
} from "@/modules/finance/controller";
