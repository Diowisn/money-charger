import { redirect } from "next/navigation";
import { authDikonfigurasi, sesiValid } from "@/lib/auth";
import { configured } from "@/modules/auth/oauth";
import LoginForm from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await sesiValid()) redirect("/");
  const query = await searchParams;
  return (
    <LoginForm
      registerFirst={await authDikonfigurasi()}
      googleEnabled={configured("google")}
      facebookEnabled={configured("facebook")}
      oauthError={query.error === "oauth"}
    />
  );
}
