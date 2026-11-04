export function responsHealth(data: unknown) {
  return Response.json(data, { headers: { "cache-control": "no-store" } });
}
