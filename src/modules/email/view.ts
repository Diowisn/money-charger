export function emailOk(pesan: string, dicatat: boolean) {
  return Response.json({ ok: true, dicatat, pesan });
}

export function emailGagal(pesan: string, status: number) {
  return Response.json({ ok: false, error: pesan }, { status });
}
