export function eksporTidakDitemukan() {
  return new Response("Not found", { status: 404 });
}

export function unduhanTerenkripsi(data: Buffer) {
  return new Response(new Uint8Array(data), {
    status: 200,
    headers: {
      "content-type": "application/octet-stream",
      "content-disposition": 'attachment; filename="money-charger-transaksi.enc"',
      "cache-control": "no-store",
    },
  });
}

export function unduhanCsv(csv: string) {
  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="money-charger-transaksi.csv"',
      "cache-control": "no-store",
    },
  });
}
