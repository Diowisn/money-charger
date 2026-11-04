export function eksporTidakDitemukan() {
  return new Response("Not found", { status: 404 });
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
