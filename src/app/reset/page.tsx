import ResetForm from "./reset-form";

export const dynamic = "force-dynamic";

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const query = await searchParams;
  return <ResetForm token={typeof query.token === "string" ? query.token : ""} />;
}
