type KirimEmail = { to: string; subject: string; teks: string; html?: string };

export function emailTerkonfigurasi(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.EMAIL_FROM?.trim());
}

export async function kirimEmail({ to, subject, teks, html }: KirimEmail): Promise<boolean> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!key || !from) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, text: teks, html: html ?? undefined }),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}
