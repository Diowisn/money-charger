export function unduhanIcs(ics: string) {
  return new Response(ics, {
    status: 200,
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'attachment; filename="money-charger.ics"',
      "cache-control": "no-store",
    },
  });
}
